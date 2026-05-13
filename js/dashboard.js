// ─── State ───────────────────────────────────────────────────────────────────
const today       = new Date().toISOString().slice(0, 10);
let currentUser   = null;
let userSchedules = [];
let currentTab    = 'today';
let calYear       = new Date().getFullYear();
let calMonth      = new Date().getMonth(); // 0-indexed
let calSelected   = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}
function fmtTime(t) {
  if (!t) return '—';
  const [h, min] = t.split(':');
  const hh = parseInt(h);
  return `${hh % 12 || 12}:${min} ${hh < 12 ? 'AM' : 'PM'}`;
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Boot ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const r = await fetch('api/me.php');
    if (!r.ok) { location.href = 'login.html'; return; }
    currentUser = await r.json();
    if (currentUser.role === 'admin') { location.href = 'admin.html'; return; }
  } catch { location.href = 'login.html'; return; }

  // Nav
  document.getElementById('nav-name').textContent = currentUser.name;
  document.getElementById('nav-role').textContent = currentUser.role;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('api/logout.php', { method: 'POST' });
    location.href = 'login.html';
  });

  // Profile card
  document.getElementById('profile-avatar').textContent = currentUser.role === 'driver' ? '🚗' : '👩‍⚕️';
  document.getElementById('profile-name').textContent   = currentUser.name;
  document.getElementById('profile-meta').textContent   = `${currentUser.role} · ${currentUser.email}`;
  if (currentUser.phone) document.getElementById('profile-phone').textContent = `📞 ${currentUser.phone}`;
  document.getElementById('profile-card').style.display = '';

  // Fetch schedules
  try {
    const r2 = await fetch('api/schedules.php');
    userSchedules = await r2.json();
  } catch {
    document.getElementById('schedule-output').innerHTML =
      '<div class="empty-state"><div class="icon">⚠️</div><p>Failed to load schedules.</p></div>';
    return;
  }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      renderTab(currentTab);
    });
  });

  renderTab('today');
})();

function renderTab(tab) {
  const out = document.getElementById('schedule-output');
  if      (tab === 'today')    renderToday(out);
  else if (tab === 'calendar') renderCalendar(out);
  else if (tab === 'all')      renderAll(out);
}

// ─── Schedule card ────────────────────────────────────────────────────────────
function cardHtml(s, isPast) {
  const isDriver     = currentUser.role === 'driver';
  const partnerLabel = isDriver ? 'Nurse' : 'Driver';
  const pName        = isDriver ? s.nurse_name  : s.driver_name;
  const pPhone       = isDriver ? s.nurse_phone : s.driver_phone;
  return `
    <div class="sched-card ${isPast ? 'past' : 'upcoming'}">
      <div class="sched-date">${esc(fmtDate(s.date))}</div>
      <div class="sched-time">${esc(fmtTime(s.shift_time))}</div>
      <div class="sched-route">
        <div class="loc">📍 <span>${esc(s.pickup_location)}</span></div>
        <div class="loc">🏥 <span>${esc(s.drop_location)}</span></div>
      </div>
      <div class="sched-contact">
        <div class="contact-label">${esc(partnerLabel)}</div>
        ${pName
          ? `<div class="contact-name">${esc(pName)}</div>
             <div class="contact-phone">📞 ${esc(pPhone || 'No phone on file')}</div>`
          : `<div style="color:#94a3b8;font-size:13px">Not assigned</div>`}
      </div>
      ${s.notes ? `<div class="sched-notes">📝 ${esc(s.notes)}</div>` : ''}
    </div>`;
}

// ─── Today View ──────────────────────────────────────────────────────────────
function renderToday(container) {
  const list = userSchedules.filter(s => s.date === today);

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">☀️</div>
        <p style="font-size:16px;font-weight:600;color:#1e293b;margin-bottom:6px">No schedule today</p>
        <p>${fmtDate(today)}</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header green" style="margin-bottom:14px">
      ☀️ Today — ${esc(fmtDate(today))}
    </div>
    <div class="schedule-grid">${list.map(s => cardHtml(s, false)).join('')}</div>`;
}

// ─── All Schedules View ───────────────────────────────────────────────────────
function renderAll(container) {
  const upcoming = userSchedules.filter(s => s.date >= today);
  const past     = userSchedules.filter(s => s.date <  today);

  if (userSchedules.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>No schedules assigned to you yet.</p></div>';
    return;
  }

  let html = '';
  if (upcoming.length > 0) {
    html += `<div class="section-header green" style="margin-bottom:12px">✅ Upcoming (${upcoming.length})</div>
             <div class="schedule-grid" style="margin-bottom:32px">${upcoming.map(s => cardHtml(s,false)).join('')}</div>`;
  }
  if (past.length > 0) {
    html += `<div class="section-header gray" style="margin-bottom:12px">Past (${past.length})</div>
             <div class="schedule-grid">${past.map(s => cardHtml(s,true)).join('')}</div>`;
  }
  container.innerHTML = html;
}

// ─── Calendar View ────────────────────────────────────────────────────────────
function renderCalendar(container) {
  // Build date → schedules map
  const schedMap = {};
  userSchedules.forEach(s => {
    if (!schedMap[s.date]) schedMap[s.date] = [];
    schedMap[s.date].push(s);
  });

  const firstDay   = new Date(calYear, calMonth, 1);
  const lastDay    = new Date(calYear, calMonth + 1, 0);
  const monthLabel = firstDay.toLocaleString('en-AU', { month: 'long', year: 'numeric' });

  // Week starts Monday: Mon=0 … Sun=6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const DAY_NAMES   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  let cells = '';
  for (let i = 0; i < startOffset; i++) {
    cells += '<div class="cal-day empty"></div>';
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const mm      = String(calMonth + 1).padStart(2, '0');
    const dd      = String(d).padStart(2, '0');
    const dateStr = `${calYear}-${mm}-${dd}`;
    const hasSched = !!schedMap[dateStr];
    const isPast   = dateStr < today;
    const isToday  = dateStr === today;
    const isSel    = dateStr === calSelected;

    let cls = 'cal-day';
    if (hasSched) cls += isPast ? ' has-sched past' : ' has-sched upcoming';
    if (isToday)  cls += ' today';
    if (isSel)    cls += ' selected';

    const dot = hasSched ? `<span class="cal-dot${isPast ? ' past' : ''}"></span>` : '';
    cells += `<div class="${cls}" onclick="calClick('${dateStr}')"><span>${d}</span>${dot}</div>`;
  }

  // Detail section below calendar
  let detailHtml = '';
  if (calSelected) {
    const list = schedMap[calSelected] || [];
    const isPast = calSelected < today;
    if (list.length === 0) {
      detailHtml = `
        <div class="empty-state" style="padding:28px 20px">
          <div class="icon">📭</div>
          <p>No schedule on ${esc(fmtDate(calSelected))}</p>
        </div>`;
    } else {
      detailHtml = `
        <div class="section-header ${isPast ? 'gray' : 'green'}" style="margin:20px 0 12px">
          ${isPast ? '' : '✅ '}${esc(fmtDate(calSelected))}
        </div>
        <div class="schedule-grid">${list.map(s => cardHtml(s, isPast)).join('')}</div>`;
    }
  }

  container.innerHTML = `
    <div class="card" style="margin-bottom:0">
      <!-- Month navigation -->
      <div class="cal-nav">
        <button class="btn btn-ghost btn-sm" onclick="calMove(-1)">&#8592; Prev</button>
        <h3 class="cal-month-label">${esc(monthLabel)}</h3>
        <button class="btn btn-ghost btn-sm" onclick="calMove(1)">Next &#8594;</button>
      </div>

      <!-- Day-name headers -->
      <div class="cal-grid">
        ${DAY_NAMES.map(n => `<div class="cal-day-name">${n}</div>`).join('')}
        ${cells}
      </div>

      <!-- Legend -->
      <div class="cal-legend">
        <span><i class="legend-dot upcoming"></i> Scheduled</span>
        <span><i class="legend-dot past"></i> Past</span>
        <span class="cal-today-key">Today</span>
      </div>
    </div>

    <div id="cal-detail">${detailHtml}</div>`;
}

// Called when the user clicks a day cell
function calClick(dateStr) {
  calSelected = (calSelected === dateStr) ? null : dateStr; // toggle
  renderTab('calendar');
}

// Navigate months
function calMove(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderTab('calendar');
}
