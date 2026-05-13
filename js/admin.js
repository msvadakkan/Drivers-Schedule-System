// ─── State ───────────────────────────────────────────────────────────────────
let allUsers     = [];
let allSchedules = [];
let currentTab   = 'schedules';
const today      = new Date().toISOString().slice(0, 10);

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
  const [u, s] = await Promise.all([api('api/users.php'), api('api/schedules.php')]);
  if (!u || !s) return;
  allUsers     = u;
  allSchedules = s;
  renderStats();
  renderTab(currentTab);
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
      document.getElementById(`panel-${currentTab}`).style.display = '';
      renderTab(currentTab);
    });
  });
}

function renderTab(tab) {
  if (tab === 'schedules') renderSchedules();
  else if (tab === 'drivers') renderUsers('driver');
  else if (tab === 'nurses')  renderUsers('nurse');
}

// ─── Stats ───────────────────────────────────────────────────────────────────
function renderStats() {
  const drivers  = allUsers.filter(u => u.role === 'driver').length;
  const nurses   = allUsers.filter(u => u.role === 'nurse').length;
  const upcoming = allSchedules.filter(s => s.date >= today).length;
  document.getElementById('stat-drivers').textContent  = drivers;
  document.getElementById('stat-nurses').textContent   = nurses;
  document.getElementById('stat-total').textContent    = allSchedules.length;
  document.getElementById('stat-upcoming').textContent = upcoming;
}

// ─── Schedules panel ─────────────────────────────────────────────────────────
function renderSchedules() {
  const panel = document.getElementById('panel-schedules');
  if (allSchedules.length === 0) {
    panel.innerHTML = `<div class="card">
      <div class="card-header"><h2>All Schedules</h2>
        <button class="btn btn-primary" onclick="openScheduleModal()">+ Add Schedule</button>
      </div>
      <div class="empty-state"><div class="icon">📅</div><p>No schedules yet. Add one to get started.</p></div>
    </div>`;
    return;
  }

  const rows = allSchedules.map(s => {
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
    <div class="card-header"><h2>All Schedules</h2>
      <button class="btn btn-primary" onclick="openScheduleModal()">+ Add Schedule</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Date</th><th>Driver</th><th>Nurses &amp; Trips</th><th>Notes</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
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

  const rows = list.map(u => `
    <tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.phone || '—')}</td>
      <td style="color:#64748b">${esc(fmtDate(u.created_at?.slice(0,10)))}</td>
      <td>
        <div class="btn-actions">
          <button class="btn btn-ghost btn-sm" onclick="openUserModal(${u.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Delete</button>
        </div>
      </td>
    </tr>`).join('');

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
  if (btn) { btn.disabled = saving; btn.textContent = saving ? 'Saving…' : 'Save'; }
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
function openScheduleModal(id) {
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
          <input id="f-date" type="date" value="${esc(s?.date||'')}" required />
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
