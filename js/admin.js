// ─── State ───────────────────────────────────────────────────────────────────
let allUsers     = [];
let allSchedules = [];
let lateReports  = [];
let currentTab   = 'schedules';
const today      = new Date().toISOString().slice(0, 10);
let calYear      = new Date().getFullYear();
let calMonth     = new Date().getMonth();
let calSelected  = null;
let scheduleDateFilter = '';

// ─── API helper ──────────────────────────────────────────────────────────────
async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) { location.href = 'login.html'; return null; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── Formatting ──────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
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
function waUrl(phone, text = '') {
  if (!phone) return '';
  let num = phone.replace(/\D/g, '');
  if (num.startsWith('0')) num = '61' + num.slice(1);
  const url = `https://wa.me/${num}`;
  return text ? `${url}?text=${encodeURIComponent(text)}` : url;
}

// ─── Boot ────────────────────────────────────────────────────────────────────
(async () => {
  const user = await api('api/me.php');
  if (!user) return;
  if (user.role !== 'admin') { location.href = 'dashboard.html'; return; }
  document.getElementById('nav-name').textContent = user.name;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('api/logout.php', 'POST');
    location.href = 'login.html';
  });
  setupTabs();
  await loadAll();
})();

async function loadAll() {
  const [u, s, r] = await Promise.all([
    api('api/users.php'),
    api('api/schedules.php'),
    api('api/late-report.php')
  ]);
  if (!u || !s) return;
  allUsers     = u;
  allSchedules = s;
  lateReports  = r || [];
  renderStats();
  renderTab(currentTab);
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  currentTab = tab;
  document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById(`panel-${tab}`);
  if (panel) panel.style.display = '';
  renderTab(tab);
}

function renderTab(tab) {
  if      (tab === 'schedules')     renderSchedules();
  else if (tab === 'calendar')      renderCalendar();
  else if (tab === 'all-schedules') renderAllSchedules();
  else if (tab === 'drivers')       renderUsers('driver');
  else if (tab === 'nurses')        renderUsers('nurse');
  else if (tab === 'reports')       renderLateReports();
}

// ─── Stats ───────────────────────────────────────────────────────────────────
function renderStats() {
  const drivers   = allUsers.filter(u => u.role === 'driver').length;
  const nurses    = allUsers.filter(u => u.role === 'nurse').length;
  const upcoming  = allSchedules.filter(s => s.date >= today).length;
  const lateToday = lateReports.filter(r => r.schedule_date === today).length;
  document.getElementById('stat-drivers').textContent  = drivers;
  document.getElementById('stat-nurses').textContent   = nurses;
  document.getElementById('stat-total').textContent    = allSchedules.length;
  document.getElementById('stat-upcoming').textContent = upcoming;
  document.getElementById('stat-late').textContent     = lateToday;
}

// ─── Today panel ─────────────────────────────────────────────────────────────
function renderSchedules() {
  const panel    = document.getElementById('panel-schedules');
  const filtered = allSchedules.filter(s => s.date === today);
  const todayLate = lateReports.filter(r => r.schedule_date === today);

  let lateHtml = '';
  if (todayLate.length > 0) {
    const lRows = todayLate.map(r => `
      <div class="late-row">
        <span class="badge" style="background:#fef3c7;color:#92400e">⏰ Late</span>
        <strong>${esc(r.nurse_name)}</strong>
        <span style="color:#64748b">reported by ${esc(r.driver_name)} at ${esc(r.reported_at.slice(11,16))}</span>
      </div>`).join('');
    lateHtml = `<div class="card" style="margin-bottom:16px">
      <div class="card-header" style="margin-bottom:10px"><h2>⚠️ Late Reports Today</h2></div>
      <div style="display:flex;flex-direction:column;gap:8px">${lRows}</div>
    </div>`;
  }

  if (filtered.length === 0) {
    panel.innerHTML = lateHtml + `<div class="card">
      <div class="card-header">
        <h2>☀️ Today — ${esc(fmtDate(today))}</h2>
        <button class="btn btn-primary" onclick="openScheduleModal(null,'${today}')">+ Add for Today</button>
      </div>
      <div class="empty-state"><div class="icon">📅</div><p>No schedules for today.</p></div>
    </div>`;
    return;
  }

  const rows = filtered.map(s => {
    const trips = s.trips || [];
    const nursesHtml = trips.length === 0
      ? `<span class="badge badge-unassigned">No nurses</span>`
      : trips.map(t => {
          const isLate = lateReports.some(r => r.schedule_id == s.id && r.nurse_id == t.nurse_id);
          return `
          <div class="trip-summary">
            <span class="badge badge-nurse">${esc(t.nurse_name || 'Unassigned')}</span>
            ${isLate ? `<span class="badge" style="background:#fef3c7;color:#92400e;font-size:11px">⏰ Late</span>` : ''}
            <span class="trip-time">${esc(fmtTime(t.pickup_time))}</span>
            <span class="trip-route">${esc(t.pickup_location)} → ${esc(t.drop_location)}</span>
          </div>`;}).join('');
    const waLink = s.driver_phone ? waUrl(s.driver_phone, `Hi ${s.driver_name}, checking on today's schedule.`) : '';
    return `
    <tr>
      <td>${s.driver_name
        ? `<div style="font-weight:600">${esc(s.driver_name)}</div>
           <div class="td-sub">${esc(s.driver_phone || 'No phone')}</div>
           ${waLink ? `<a href="${waLink}" target="_blank" class="btn btn-ghost btn-sm" style="margin-top:4px">💬 WhatsApp</a>` : ''}`
        : `<span class="badge badge-unassigned">Unassigned</span>`}</td>
      <td>${nursesHtml}</td>
      <td style="color:#64748b;font-style:italic">${esc(s.notes || '—')}</td>
      <td>
        <div class="btn-actions">
          <button class="btn btn-ghost btn-sm" onclick="openScheduleModal(${s.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSchedule(${s.id})">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  panel.innerHTML = lateHtml + `<div class="card">
    <div class="card-header">
      <h2>☀️ Today — ${esc(fmtDate(today))}</h2>
      <button class="btn btn-primary" onclick="openScheduleModal(null,'${today}')">+ Add for Today</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Driver</th><th>Nurses &amp; Trips</th><th>Notes</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ─── All Schedules panel ──────────────────────────────────────────────────────
function renderAllSchedules() {
  const panel    = document.getElementById('panel-all-schedules');
  const filtered = scheduleDateFilter
    ? allSchedules.filter(s => s.date === scheduleDateFilter)
    : allSchedules;

  const tableRows = filtered.map(s => {
    const trips = s.trips || [];
    const nursesHtml = trips.length === 0
      ? `<span class="badge badge-unassigned">No nurses</span>`
      : trips.map(t => `
          <div class="trip-summary">
            <span class="badge badge-nurse">${esc(t.nurse_name || 'Unassigned')}</span>
            <span class="trip-time">${esc(fmtTime(t.pickup_time))}</span>
            <span class="trip-route">${esc(t.pickup_location)} → ${esc(t.drop_location)}</span>
          </div>`).join('');
    return `
    <tr>
      <td><strong>${esc(fmtDate(s.date))}</strong></td>
      <td>${s.driver_name
        ? `<div>${esc(s.driver_name)}</div><div class="td-sub">${esc(s.driver_phone || 'No phone')}</div>`
        : `<span class="badge badge-unassigned">Unassigned</span>`}</td>
      <td>${nursesHtml}</td>
      <td style="color:#64748b;font-style:italic">${esc(s.notes || '—')}</td>
      <td>
        <div class="btn-actions">
          <button class="btn btn-ghost btn-sm" onclick="openScheduleModal(${s.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSchedule(${s.id})">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  panel.innerHTML = `<div class="card">
    <div class="card-header">
      <h2>📅 All Schedules</h2>
      <div style="display:flex;gap:10px;align-items:center">
        <input type="date" id="sched-date-filter" value="${esc(scheduleDateFilter)}"
          style="padding:6px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px" />
        ${scheduleDateFilter ? `<button class="btn btn-ghost btn-sm" onclick="clearDateFilter()">✕ Clear</button>` : ''}
        <button class="btn btn-primary" onclick="openScheduleModal()">+ Add Schedule</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Date</th><th>Driver</th><th>Nurses &amp; Trips</th><th>Notes</th><th>Actions</th>
        </tr></thead>
        <tbody>${tableRows.length ? tableRows
          : '<tr><td colspan="5"><div class="empty-state" style="padding:20px"><p>No schedules found.</p></div></td></tr>'}</tbody>
      </table>
    </div>
  </div>`;

  document.getElementById('sched-date-filter')?.addEventListener('change', e => {
    scheduleDateFilter = e.target.value;
    renderAllSchedules();
  });
}

// ─── Users panel ─────────────────────────────────────────────────────────────
function renderUsers(role) {
  const panel = document.getElementById(`panel-${role}s`);
  const list  = allUsers.filter(u => u.role === role);
  const icon  = role === 'driver' ? '🚗' : '👩‍⚕️';
  const label = role === 'driver' ? 'Driver' : 'Nurse';

  if (list.length === 0) {
    panel.innerHTML = `<div class="card">
      <div class="card-header"><h2>${icon} ${label}s</h2>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="openImportModal('${role}')">⬆ Import CSV</button>
          <button class="btn btn-primary" onclick="openUserModal(null,'${role}')">+ Add ${label}</button>
        </div>
      </div>
      <div class="empty-state"><div class="icon">${icon}</div><p>No ${label.toLowerCase()}s yet.</p></div>
    </div>`;
    return;
  }

  const rows = list.map(u => {
    const waLink = u.phone ? waUrl(u.phone, '') : '';
    return `
    <tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.phone || '—')} ${waLink ? `<a href="${waLink}" target="_blank" style="text-decoration:none;font-size:16px" title="WhatsApp">💬</a>` : ''}</td>
      <td style="color:#64748b">${esc(fmtDate(u.created_at?.slice(0,10)))}</td>
      <td>
        <div class="btn-actions">
          <button class="btn btn-ghost btn-sm" onclick="openUserModal(${u.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Delete</button>
        </div>
      </td>
    </tr>`; });

  panel.innerHTML = `<div class="card">
    <div class="card-header"><h2>${icon} ${label}s</h2>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="openImportModal('${role}')">⬆ Import CSV</button>
        <button class="btn btn-primary" onclick="openUserModal(null,'${role}')">+ Add ${label}</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Added</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function showModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-error').style.display = 'none';
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}
document.addEventListener('click', e => {
  if (e.target.id === 'modal-overlay') closeModal();
});

function setModalError(msg) {
  const el = document.getElementById('modal-error');
  el.textContent = msg;
  el.style.display = 'block';
}
function setSaving(saving) {
  const btn = document.getElementById('modal-save-btn');
  if (!btn) return;
  if (saving) {
    btn.dataset.orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.orig || 'Save';
  }
}

// ─── User Modal ──────────────────────────────────────────────────────────────
function openUserModal(id, defaultRole) {
  const user  = id ? allUsers.find(u => u.id === id) : null;
  const role  = user ? user.role : (defaultRole || 'driver');
  const title = user ? `Edit ${role === 'driver' ? 'Driver' : 'Nurse'}` : `Add ${role === 'driver' ? 'Driver' : 'Nurse'}`;

  showModal(title, `
    <form id="user-form">
      <div class="form-row">
        <div class="form-group">
          <label>Full Name *</label>
          <input id="f-name" value="${esc(user?.name || '')}" required placeholder="John Smith" />
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input id="f-phone" value="${esc(user?.phone || '')}" placeholder="0400 000 000" />
        </div>
      </div>
      <div class="form-group">
        <label>Email *</label>
        <input id="f-email" type="email" value="${esc(user?.email || '')}" required placeholder="john@example.com" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${user ? 'New Password' : 'Password *'}</label>
          <input id="f-password" type="password" ${user ? '' : 'required'} placeholder="${user ? 'Leave blank to keep' : '••••••••'}" />
        </div>
        ${!user ? `<div class="form-group">
          <label>Role *</label>
          <select id="f-role">
            <option value="driver" ${role==='driver'?'selected':''}>Driver</option>
            <option value="nurse"  ${role==='nurse' ?'selected':''}>Nurse</option>
          </select>
        </div>` : ''}
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="modal-save-btn">Save</button>
      </div>
    </form>`);

  document.getElementById('user-form').addEventListener('submit', async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name:  document.getElementById('f-name').value,
        email: document.getElementById('f-email').value,
        phone: document.getElementById('f-phone').value,
      };
      const pw = document.getElementById('f-password').value;
      if (pw) payload.password = pw;
      if (!user) payload.role = document.getElementById('f-role').value;
      else payload.password = pw || undefined;

      if (user) await api(`api/users.php?id=${id}`, 'PUT', payload);
      else      await api('api/users.php', 'POST', { ...payload, password: pw, role: payload.role });

      closeModal();
      await loadAll();
    } catch (ex) {
      setModalError(ex.message);
      setSaving(false);
    }
  });
}

// ─── Schedule Modal ───────────────────────────────────────────────────────────
function openScheduleModal(id, defaultDate = '') {
  const s       = id ? allSchedules.find(x => x.id === id) : null;
  const drivers = allUsers.filter(u => u.role === 'driver');
  const nurses  = allUsers.filter(u => u.role === 'nurse');

  const driverOpts = [`<option value="">— Unassigned —</option>`,
    ...drivers.map(d => `<option value="${d.id}" ${s?.driver_id==d.id?'selected':''}>${esc(d.name)}</option>`)
  ].join('');

  showModal(s ? 'Edit Schedule' : 'Add Schedule', `
    <form id="sched-form">
      <div class="form-row">
        <div class="form-group">
          <label>Date *</label>
          <input id="f-date" type="date" value="${esc(s?.date || defaultDate)}" required />
        </div>
        <div class="form-group">
          <label>Driver</label>
          <select id="f-driver">${driverOpts}</select>
        </div>
      </div>

      <!-- Nurse trips -->
      <div style="margin:18px 0 8px;font-weight:700;font-size:13px;color:#374151">
        Nurses &amp; Trips
      </div>
      <div id="nurse-rows"></div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom:16px"
        onclick="addNurseRow()">+ Add Nurse</button>

      <div class="form-group">
        <label>Notes</label>
        <textarea id="f-notes" placeholder="Any special instructions…">${esc(s?.notes||'')}</textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="modal-save-btn">Save Schedule</button>
      </div>
    </form>`);

  // Populate existing trips or start with one empty row
  const existingTrips = s?.trips?.length ? s.trips : [{}];
  existingTrips.forEach(t => addNurseRow(t, nurses));

  document.getElementById('sched-form').addEventListener('submit', async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const trips = collectNurseRows();
      const payload = {
        date:      document.getElementById('f-date').value,
        driver_id: document.getElementById('f-driver').value || null,
        notes:     document.getElementById('f-notes').value,
        trips,
      };
      if (s) await api(`api/schedules.php?id=${id}`, 'PUT', payload);
      else   await api('api/schedules.php', 'POST', payload);
      closeModal();
      await loadAll();
    } catch (ex) {
      setModalError(ex.message);
      setSaving(false);
    }
  });
}

// Build one nurse-row inside the modal
function addNurseRow(data = {}, nursesOverride) {
  const nurses = nursesOverride || allUsers.filter(u => u.role === 'nurse');
  const nurseOpts = [`<option value="">— Unassigned —</option>`,
    ...nurses.map(n => `<option value="${n.id}" ${data.nurse_id==n.id?'selected':''}>${esc(n.name)}</option>`)
  ].join('');

  const div = document.createElement('div');
  div.className = 'nurse-row';
  div.innerHTML = `
    <div class="nurse-row-header">
      <span>🧑‍⚕️ Nurse</span>
      <button type="button" class="btn btn-danger btn-sm"
        onclick="this.closest('.nurse-row').remove()">× Remove</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Nurse</label>
        <select class="nr-nurse">${nurseOpts}</select>
      </div>
      <div class="form-group">
        <label>Pickup Time *</label>
        <input type="time" class="nr-pickup-time" value="${esc(data.pickup_time||'')}" required />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Pickup Location *</label>
        <input class="nr-pickup-loc" value="${esc(data.pickup_location||'')}" required placeholder="123 Main St" />
      </div>
      <div class="form-group">
        <label>Drop Location *</label>
        <input class="nr-drop-loc" value="${esc(data.drop_location||'')}" required placeholder="Hospital Ave" />
      </div>
    </div>`;
  document.getElementById('nurse-rows').appendChild(div);
}

function collectNurseRows() {
  return Array.from(document.querySelectorAll('.nurse-row')).map(row => ({
    nurse_id:        row.querySelector('.nr-nurse').value        || null,
    pickup_time:     row.querySelector('.nr-pickup-time').value,
    pickup_location: row.querySelector('.nr-pickup-loc').value,
    drop_location:   row.querySelector('.nr-drop-loc').value,
  }));
}

// ─── Delete ───────────────────────────────────────────────────────────────────
async function deleteUser(id) {
  if (!confirm('Delete this user? Their schedules will become unassigned.')) return;
  await api(`api/users.php?id=${id}`, 'DELETE');
  await loadAll();
}
async function deleteSchedule(id) {
  if (!confirm('Delete this schedule?')) return;
  await api(`api/schedules.php?id=${id}`, 'DELETE');
  await loadAll();
}
function clearDateFilter() {
  scheduleDateFilter = '';
  renderAllSchedules();
}

// ─── Late Reports panel ───────────────────────────────────────────────────────
function renderLateReports() {
  const panel = document.getElementById('panel-reports');

  if (lateReports.length === 0) {
    panel.innerHTML = `<div class="card">
      <div class="card-header"><h2>⚠️ Late Reports</h2></div>
      <div class="empty-state"><div class="icon">✅</div><p>No late reports yet. Great!</p></div>
    </div>`;
    return;
  }

  const rows = lateReports.map(r => `
    <tr>
      <td><strong>${esc(fmtDate(r.schedule_date))}</strong></td>
      <td>
        <span class="badge badge-nurse">${esc(r.nurse_name)}</span>
      </td>
      <td>${esc(r.driver_name)}</td>
      <td style="color:#64748b;font-size:12px">${esc(r.reported_at)}</td>
    </tr>`).join('');

  panel.innerHTML = `<div class="card">
    <div class="card-header">
      <h2>⚠️ Late Reports</h2>
      <span class="badge" style="background:#fef3c7;color:#92400e;font-size:13px">${lateReports.length} total</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Date</th><th>Nurse (Late)</th><th>Reported By Driver</th><th>Reported At</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ─── Calendar View ────────────────────────────────────────────────────────────
function renderCalendar() {
  const panel = document.getElementById('panel-calendar');
  const schedMap = {};
  allSchedules.forEach(s => {
    if (!schedMap[s.date]) schedMap[s.date] = [];
    schedMap[s.date].push(s);
  });

  const firstDay   = new Date(calYear, calMonth, 1);
  const lastDay    = new Date(calYear, calMonth + 1, 0);
  const monthLabel = firstDay.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
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
    const dayScheds = schedMap[dateStr] || [];
    const hasSched  = dayScheds.length > 0;
    const isPast    = dateStr < today;
    const isToday   = dateStr === today;
    const isSel     = dateStr === calSelected;
    const driverIds = new Set(dayScheds.map(s => s.driver_id).filter(Boolean));
    const nurseCnt  = dayScheds.reduce((sum, s) => sum + (s.trips?.length || 0), 0);

    let cls = 'cal-day';
    if (hasSched) cls += isPast ? ' has-sched past' : ' has-sched upcoming';
    if (isToday)  cls += ' today';
    if (isSel)    cls += ' selected';

    const dot = hasSched ? `<span class="cal-dot${isPast ? ' past' : ''}"></span>` : '';
    const cnt = hasSched ? `<span style="font-size:10px;color:#64748b">${dayScheds.length} sch · ${nurseCnt} trip${nurseCnt!==1?'s':''}</span>` : '';
    cells += `<div class="${cls}" onclick="calClick('${dateStr}')"><span>${d}</span>${dot}${cnt}</div>`;
  }

  let detailHtml = '';
  if (calSelected) {
    const list = schedMap[calSelected] || [];
    const isPast = calSelected < today;
    if (list.length === 0) {
      detailHtml = `
        <div class="card" style="margin-top:16px;text-align:center;padding:28px">
          <div style="font-size:36px;margin-bottom:10px">📭</div>
          <p style="color:#64748b;margin-bottom:16px">No schedules on ${esc(fmtDate(calSelected))}</p>
          <button class="btn btn-primary" onclick="openScheduleModal(null,'${calSelected}')">
            + Add Schedule for this date
          </button>
        </div>`;
    } else {
      const schedRows = list.map(s => {
        const trips = s.trips || [];
        const tripsHtml = trips.map(t => `
          <div class="trip-summary">
            <span class="badge badge-nurse">${esc(t.nurse_name || 'Unassigned')}</span>
            <span class="trip-time">${esc(fmtTime(t.pickup_time))}</span>
            <span class="trip-route">${esc(t.pickup_location)} → ${esc(t.drop_location)}</span>
          </div>`).join('');
        const waLink = s.driver_phone ? waUrl(s.driver_phone, `Hi ${s.driver_name}, checking schedule for ${calSelected}`) : '';
        return `<div class="sched-card ${isPast ? 'past' : 'upcoming'}" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div class="sched-date">${esc(s.date)}</div>
              <div style="font-weight:700;margin:4px 0">🚗 ${esc(s.driver_name || 'Unassigned')}</div>
              ${s.driver_phone ? `<div style="font-size:13px;color:#2563eb">📞 ${esc(s.driver_phone)}</div>` : ''}
              ${waLink ? `<a href="${waLink}" target="_blank" class="btn btn-ghost btn-sm" style="margin-top:4px">💬 WhatsApp Driver</a>` : ''}
            </div>
            <div class="btn-actions">
              <button class="btn btn-ghost btn-sm" onclick="openScheduleModal(${s.id})">Edit</button>
            </div>
          </div>
          ${tripsHtml.length ? `<div style="margin-top:10px">${tripsHtml}</div>` : ''}
          ${s.notes ? `<div class="sched-notes" style="margin-top:8px">📝 ${esc(s.notes)}</div>` : ''}
        </div>`;
      }).join('');

      detailHtml = `
        <div class="card">
          <div class="card-header" style="margin-bottom:14px">
            <h2 class="${isPast ? 'gray' : 'green'}" style="font-size:15px">
              ${esc(fmtDate(calSelected))} — ${list.length} schedule${list.length!==1?'s':''}
            </h2>
            <button class="btn btn-primary btn-sm" onclick="openScheduleModal(null,'${calSelected}')">
              + Add for this date
            </button>
          </div>
          ${schedRows}
        </div>`;
    }
  }

  panel.innerHTML = `
    <div class="card" style="margin-bottom:0">
      <div class="cal-nav">
        <button class="btn btn-ghost btn-sm" onclick="calMove(-1)">&#8592; Prev</button>
        <h3 class="cal-month-label">${esc(monthLabel)}</h3>
        <button class="btn btn-ghost btn-sm" onclick="calMove(1)">Next &#8594;</button>
      </div>
      <div class="cal-grid">
        ${DAY_NAMES.map(n => `<div class="cal-day-name">${n}</div>`).join('')}
        ${cells}
      </div>
      <div class="cal-legend">
        <span><i class="legend-dot upcoming"></i> Scheduled</span>
        <span><i class="legend-dot past"></i> Past</span>
        <span class="cal-today-key">Today</span>
      </div>
    </div>
    <div id="cal-detail">${detailHtml}</div>`;
}

function calClick(dateStr) {
  calSelected = (calSelected === dateStr) ? null : dateStr;
  renderCalendar();
}

function calMove(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

// ─── Bulk Import Modal ────────────────────────────────────────────────────────
function openImportModal(role) {
  const label = role === 'driver' ? 'Drivers' : 'Nurses';

  showModal(`Import ${label} from CSV`, `
    <p style="color:#64748b;font-size:13px;margin-bottom:14px;line-height:1.7">
      CSV must have columns: <strong>name, email, password, phone</strong><br>
      <span style="color:#94a3b8">Phone is optional. Rows with duplicate emails are skipped.</span>
    </p>
    <button type="button" class="btn btn-ghost btn-sm" id="sample-btn" style="margin-bottom:16px">
      ⬇ Download Sample CSV
    </button>
    <div class="form-group">
      <label>Select CSV File</label>
      <input type="file" id="csv-file" accept=".csv,text/csv" style="cursor:pointer" />
    </div>
    <div id="csv-preview"></div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="import-btn" disabled>Import</button>
    </div>
  `);

  document.getElementById('sample-btn').addEventListener('click', () => {
    const csv = [
      'name,email,password,phone',
      'John Smith,john@example.com,pass123,0400000001',
      'Jane Doe,jane@example.com,pass456,0400000002'
    ].join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `sample_${role}s.csv`
    });
    a.click();
  });

  let parsedRows = [];

  document.getElementById('csv-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      parsedRows = parseCSV(ev.target.result);
      renderImportPreview(parsedRows);
      document.getElementById('import-btn').disabled = parsedRows.length === 0;
    };
    reader.readAsText(file);
  });

  document.getElementById('import-btn').addEventListener('click', async () => {
    const btn = document.getElementById('import-btn');
    btn.disabled = true;
    btn.textContent = 'Importing…';
    try {
      const res = await api('api/import-users.php', 'POST', { role, users: parsedRows });
      let msg = `Imported: ${res.imported}`;
      if (res.skipped)         msg += `\nSkipped (duplicate email): ${res.skipped}`;
      if (res.errors?.length)  msg += `\n\nErrors:\n${res.errors.join('\n')}`;
      alert(msg);
      closeModal();
      await loadAll();
    } catch (ex) {
      setModalError(ex.message);
      btn.disabled = false;
      btn.textContent = 'Import';
    }
  });
}

function renderImportPreview(rows) {
  const el = document.getElementById('csv-preview');
  if (rows.length === 0) {
    el.innerHTML = '<div class="alert-error" style="margin-top:12px">No valid rows found. Make sure the CSV has name, email, and password columns.</div>';
    return;
  }
  const rowsHtml = rows.map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.email)}</td>
      <td>${esc(r.phone || '—')}</td>
    </tr>`).join('');
  el.innerHTML = `
    <p style="font-size:13px;color:#64748b;margin:12px 0 8px">
      Preview — <strong>${rows.length}</strong> row${rows.length > 1 ? 's' : ''} ready to import:
    </p>
    <div class="table-wrap" style="max-height:210px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const row  = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] ?? '').trim().replace(/^"|"$/g, ''); });
    if (row.name && row.email && row.password) rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += ch;
  }
  result.push(current);
  return result;
}
