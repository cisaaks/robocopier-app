// renderer.js - UI logic for the main window.
// Talks to the main process via window.api (defined by preload.js).

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let cfg = null;
let selectedTaskNames = new Set();
let editingTaskName = null;

const COLORS = {
  green:  'last-recent',
  orange: 'last-stale',
  red:    'last-old',
};

async function boot() {
  try {
    cfg = await window.api.config.get();
  } catch (e) {
    console.error('config.get failed:', e);
    cfg = { defaultDestinationRoot: '', tasks: [], warnFileCount: 200, warnSizeMB: 200 };
  }
  try {
    const v = await window.api.app.version();
    $('#appVersion').textContent = v ? ('v' + v) : 'v?';
  } catch (e) {
    $('#appVersion').textContent = 'v?';
  }
  renderDefaultDest();
  renderTaskList();
  attachHandlers();
  attachUpdateListener();
}

window.addEventListener('DOMContentLoaded', boot);

function renderDefaultDest() {
  const el = $('#defaultDestPath');
  if (el) el.value = cfg.defaultDestinationRoot || '';
}

function scheduleSummary(s) {
  if (!s || !s.type || s.type === 'none') return 'None';
  const t = s.time || '??:??';
  if (s.type === 'daily')   return 'Daily ' + t;
  if (s.type === 'weekly')  return 'Weekly ' + (s.dayOfWeek || '?') + ' ' + t;
  if (s.type === 'monthly') return 'Monthly day ' + (s.dayOfMonth || '?') + ' ' + t;
  return 'None';
}

function ageBucket(lr) {
  if (!lr) return 'red';
  try {
    const d = new Date(lr.replace(' ', 'T'));
    const days = (Date.now() - d.getTime()) / 86400000;
    if (days < 7) return 'green';
    if (days < 30) return 'orange';
    return 'red';
  } catch { return 'red'; }
}

function destFor(task) {
  if (task.destinationOverride) return task.destinationOverride;
  return (cfg.defaultDestinationRoot || '').replace(/\\$/, '') + '\\' + task.name;
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}

function renderTaskList() {
  const tbody = $('#taskTbody');
  const empty = $('#emptyState');
  if (!tbody) return;
  tbody.innerHTML = '';
  const tasks = cfg.tasks || [];
  if (tasks.length === 0) {
    if (empty) empty.hidden = false;
    refreshButtonStates();
    return;
  }
  if (empty) empty.hidden = true;

  for (const t of tasks) {
    const tr = document.createElement('tr');
    tr.dataset.name = t.name;
    if (selectedTaskNames.has(t.name)) tr.classList.add('selected');
    const mode = t.mode || 'replace';
    const sched = scheduleSummary(t.schedule);
    const lr = t.lastRefreshed || 'never';
    const ageCls = lr === 'never' ? 'last-old' : COLORS[ageBucket(lr)];
    tr.innerHTML =
      '<td>' + esc(t.name) + '</td>' +
      '<td class="muted">' + esc(t.source) + '</td>' +
      '<td class="muted">' + esc(destFor(t)) + '</td>' +
      '<td class="mode-' + mode + '">' + mode.toUpperCase() + '</td>' +
      '<td class="' + (sched === 'None' ? 'sched-none' : 'sched-set') + '">' + esc(sched) + '</td>' +
      '<td class="' + ageCls + '">' + esc(lr) + '</td>';
    tr.addEventListener('click', (e) => onRowClick(e, t.name));
    tr.addEventListener('dblclick', () => onEdit());
    tbody.appendChild(tr);
  }
  refreshButtonStates();
}

function onRowClick(e, name) {
  if (e.ctrlKey || e.metaKey) {
    if (selectedTaskNames.has(name)) selectedTaskNames.delete(name);
    else selectedTaskNames.add(name);
  } else {
    selectedTaskNames = new Set([name]);
  }
  renderTaskList();
}

function refreshButtonStates() {
  const n = selectedTaskNames.size;
  $('#btnEdit').disabled = (n !== 1);
  $('#btnRemove').disabled = (n === 0);
  $('#btnRefreshSel').disabled = (n === 0);
  $('#btnRefreshAll').disabled = (cfg.tasks || []).length === 0;
}

function setStatus(text, level) {
  $('#statusText').textContent = text;
  const dot = $('#statusDot');
  dot.classList.remove('warn', 'err');
  if (level === 'warn') dot.classList.add('warn');
  if (level === 'err')  dot.classList.add('err');
}

function attachHandlers() {
  $('#btnChangeDefault').addEventListener('click', changeDefault);
  $('#btnAdd').addEventListener('click', () => openModal(null));
  $('#btnEdit').addEventListener('click', onEdit);
  $('#btnRemove').addEventListener('click', onRemove);
  $('#btnRefreshSel').addEventListener('click', onRefreshSelected);
  $('#btnRefreshAll').addEventListener('click', onRefreshAll);

  $('#modalClose').addEventListener('click', closeTaskModal);
  $('#modalCancel').addEventListener('click', closeTaskModal);
  $('#modalOk').addEventListener('click', submitModal);

  $('#fOverride').addEventListener('change', (e) => {
    $('#fDest').disabled = !e.target.checked;
    $('#fDestBrowse').disabled = !e.target.checked;
  });
  $('#fSourceBrowse').addEventListener('click', async () => {
    const p = await window.api.dialog.pickFolder($('#fSource').value);
    if (p) $('#fSource').value = p;
  });
  $('#fSourceBrowseFile').addEventListener('click', async () => {
    const p = await window.api.dialog.pickFile($('#fSource').value);
    if (p) $('#fSource').value = p;
  });
  $('#fDestBrowse').addEventListener('click', async () => {
    const p = await window.api.dialog.pickFolder($('#fDest').value);
    if (p) $('#fDest').value = p;
  });
  $('#fSchedType').addEventListener('change', syncScheduleFields);

  $('#updateBannerDismiss').addEventListener('click', () => { $('#updateBanner').hidden = true; });
  $('#btnHelp').addEventListener('click', () => { $('#helpModal').hidden = false; });
  $('#helpClose').addEventListener('click', () => { $('#helpModal').hidden = true; });
  $('#helpDone').addEventListener('click', () => { $('#helpModal').hidden = true; });

  $$('.modal').forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.hidden = true;
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal').forEach(m => { if (!m.hidden) m.hidden = true; });
    }
  });
}

async function changeDefault() {
  const p = await window.api.dialog.pickFolder(cfg.defaultDestinationRoot);
  if (!p) return;
  cfg.defaultDestinationRoot = p;
  await window.api.config.save(cfg);
  renderDefaultDest();
  renderTaskList();
  setStatus('Default destination updated.');
}

function onEdit() {
  if (selectedTaskNames.size !== 1) return;
  const name = Array.from(selectedTaskNames)[0];
  const t = (cfg.tasks || []).find(x => x.name === name);
  if (t) openModal(t);
}

async function onRemove() {
  const names = Array.from(selectedTaskNames);
  if (names.length === 0) return;
  const ok = await window.api.dialog.confirm(
    'Remove these tasks?\n\n' + names.join(', ') + '\n\nAlso deletes any Windows scheduled-task entries the app created for them. Does NOT delete files already mirrored.',
    'Confirm remove'
  );
  if (!ok) return;
  const r = await window.api.tasks.remove(names);
  if (r.success) {
    cfg = await window.api.config.get();
    selectedTaskNames.clear();
    renderTaskList();
    setStatus('Removed: ' + names.join(', '));
  }
}

async function onRefreshSelected() {
  const names = Array.from(selectedTaskNames);
  if (names.length === 0) return;
  await runRefresh(names);
}

async function onRefreshAll() {
  const names = (cfg.tasks || []).map(t => t.name);
  if (names.length === 0) return;
  await runRefresh(names);
}

async function runRefresh(names) {
  setStatus('Refreshing: ' + names.join(', ') + '...');
  const results = await window.api.tasks.refresh(names);
  cfg = await window.api.config.get();
  renderTaskList();
  const ok = results.filter(r => r.success).length;
  const fail = results.length - ok;
  setStatus('Refresh done - ' + ok + ' ok, ' + fail + ' failed.', fail > 0 ? 'warn' : null);
  for (const r of results) {
    if (!r.success) {
      await window.api.dialog.warn(r.name + ': ' + r.message, 'Refresh failed');
    }
  }
}

function openModal(task) {
  editingTaskName = task ? task.name : null;
  $('#modalTitle').textContent = task ? 'Edit task' : 'Add task';
  $('#fName').value = task ? task.name : '';
  $('#fName').disabled = !!task;
  $('#fSource').value = task ? (task.source || '') : '';
  const hasOverride = !!(task && task.destinationOverride);
  $('#fOverride').checked = hasOverride;
  $('#fDest').value = task && task.destinationOverride ? task.destinationOverride : '';
  $('#fDest').disabled = !hasOverride;
  $('#fDestBrowse').disabled = !hasOverride;
  const mode = (task && task.mode) || 'replace';
  $$('input[name=fMode]').forEach(r => { r.checked = (r.value === mode); });
  const s = (task && task.schedule) || { type: 'none' };
  $('#fSchedType').value = s.type || 'none';
  $('#fSchedTime').value = s.time || '08:00';
  $('#fSchedDow').value = s.dayOfWeek || 'SUN';
  $('#fSchedDom').value = s.dayOfMonth || 1;
  syncScheduleFields();
  $('#taskModal').hidden = false;
  setTimeout(() => $('#fName').focus(), 50);
}

function closeTaskModal() {
  $('#taskModal').hidden = true;
}

function syncScheduleFields() {
  const t = $('#fSchedType').value;
  const active = t !== 'none';
  // Time field: hidden when None, shown otherwise
  setScheduleFieldVisibility('lblTime', 'fSchedTime', active);
  // Day of week: only shown for Weekly
  setScheduleFieldVisibility('lblDow', 'fSchedDow', t === 'weekly');
  // Day of month: only shown for Monthly
  setScheduleFieldVisibility('lblDom', 'fSchedDom', t === 'monthly');
}

function setScheduleFieldVisibility(labelId, inputId, visible) {
  const label = document.getElementById(labelId);
  const input = document.getElementById(inputId);
  if (label) label.hidden = !visible;
  if (input) {
    input.hidden = !visible;
    input.disabled = !visible;
  }
}

async function submitModal() {
  const name = $('#fName').value.trim();
  const source = $('#fSource').value.trim();
  const useOverride = $('#fOverride').checked;
  const destOverride = $('#fDest').value.trim();
  const checked = $$('input[name=fMode]:checked')[0];
  const mode = checked ? checked.value : 'replace';

  if (!name) return window.api.dialog.warn('Task name is required.', 'Missing field');
  if (!source) return window.api.dialog.warn('Source folder is required.', 'Missing field');
  if (useOverride && !destOverride) return window.api.dialog.warn('Custom destination is checked but empty.', 'Missing field');

  const schedType = $('#fSchedType').value;
  let schedule = null;
  if (schedType !== 'none') {
    const time = $('#fSchedTime').value.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return window.api.dialog.warn('Time must be HH:MM in 24-hour format (e.g. 08:00 or 20:30). Hour 00-23, minute 00-59.', 'Invalid time');
    }
    schedule = {
      type: schedType,
      time: time,
      dayOfWeek:  schedType === 'weekly'  ? $('#fSchedDow').value : null,
      dayOfMonth: schedType === 'monthly' ? Number($('#fSchedDom').value) : null,
    };
  }

  const existing = editingTaskName ? (cfg.tasks || []).find(t => t.name === editingTaskName) : null;
  const task = {
    name: name,
    source: source,
    destinationOverride: useOverride ? destOverride : null,
    mode: mode,
    schedule: schedule,
    lastRefreshed: existing ? existing.lastRefreshed : null,
  };

  const result = editingTaskName
    ? await window.api.tasks.update(editingTaskName, task)
    : await window.api.tasks.add(task);

  if (!result.success) {
    return window.api.dialog.warn(result.message || 'Could not save', 'Save failed');
  }

  cfg = await window.api.config.get();
  selectedTaskNames = new Set([name]);
  renderTaskList();
  closeTaskModal();
  const sm = (result.scheduleResult && result.scheduleResult.message) || 'saved';
  setStatus((editingTaskName ? 'Updated' : 'Added') + ' task: ' + name + ' | ' + sm);
}

function attachUpdateListener() {
  if (!window.api || !window.api.on) return;
  window.api.on('update-status', (data) => {
    const banner = $('#updateBanner');
    const text = $('#updateBannerText');
    if (!banner || !text) return;
    if (data.status === 'available') {
      text.textContent = 'Update available: v' + data.version + ' - downloading...';
      banner.hidden = false;
    } else if (data.status === 'downloading') {
      text.textContent = 'Downloading update... ' + data.percent + '%';
    } else if (data.status === 'ready') {
      text.textContent = 'Update ' + data.version + ' ready - restart to apply';
    }
  });
  window.api.on('tasks-updated', async () => {
    cfg = await window.api.config.get();
    renderTaskList();
  });
}
