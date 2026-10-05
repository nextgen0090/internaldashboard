// Maintenance page: view and edit Backend / Dashboard / Games maintenance windows (24-hour times).

const MAINTENANCE_PATH = '/maintenance';

let maintenanceSettingsData = [];
let selectedMaintenanceType = '';
let maintenanceLoaded = false;

// Stored start/end are UTC (the backend compares them with DateTime.UtcNow). The form is edited
// in the display time zone and converted back to UTC on save.

/**
 * Mirrors the backend rule: maintenance applies while isMaintenance is on, start is empty or passed,
 * and end is empty or still ahead. Returns 'maintenance' | 'scheduled' | 'live'.
 */
function maintenanceState(row) {
  const flag = apiField(row, 'isMaintenance', null);
  const start = parseUtc(apiField(row, 'startTime'));
  const end = parseUtc(apiField(row, 'endTime'));
  const now = Date.now();
  // Older payloads without the flag: treat a stored window as switched on.
  const enabled = flag == null ? !!(start || end) : !!flag;
  if (!enabled) return 'live';
  if (end && now >= end.getTime()) return 'live';
  if (start && now < start.getTime()) return 'scheduled';
  return 'maintenance';
}

const MAINTENANCE_STATE_BADGES = {
  maintenance: ['Maintenance', 'down'],
  scheduled: ['Scheduled', 'warn'],
  live: ['Live', 'up'],
};

function maintenanceStateBadge(row) {
  const [label, tone] = MAINTENANCE_STATE_BADGES[maintenanceState(row)];
  return badgeHtml(label, tone);
}

function parseMaintenanceParts(value) {
  const d = parseUtc(value);
  return d ? { date: toDateInputValue(d), time: toTimeInputValue(d) } : { date: '', time: '' };
}

function normalizeTime24h(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return pad2(hh) + ':' + pad2(mm);
}

/**
 * `prefix` is maintStart or maintEnd (inputs `${prefix}Date` and `${prefix}Time`, display time zone).
 * Returns UTC without a zone suffix: the backend parses with AssumeLocal, so a "Z" would be shifted
 * into the server's local zone.
 */
function getMaintenanceDateTime(prefix) {
  const date = ($(prefix + 'Date')?.value || '').trim();
  const time = normalizeTime24h($(prefix + 'Time')?.value || '');
  if (!date || !time) return null;
  return displayInputsToUtcApiString(date, time);
}

function setMaintenanceDateTimeInputs(prefix, date, time) {
  setInputValue(prefix + 'Date', date);
  setInputValue(prefix + 'Time', time);
}

function setMaintenanceDateTime(prefix, value) {
  const parts = parseMaintenanceParts(value);
  setMaintenanceDateTimeInputs(prefix, parts.date, parts.time);
}

function writeMaintenanceDateTime(prefix, date) {
  setMaintenanceDateTimeInputs(prefix, toDateInputValue(date), toTimeInputValue(date));
}

function clearMaintDurationSelection() {
  document.querySelectorAll('.maint-duration-btn.is-active').forEach((btn) => btn.classList.remove('is-active'));
}

function currentMaintenanceType() {
  return $('maintType')?.value || 'Backend';
}

function setMaintenanceDuration(hours) {
  const hrs = Number(hours);
  if (!Number.isFinite(hrs) || hrs <= 0) return;
  const start = new Date();
  const end = new Date(start.getTime() + hrs * 60 * 60 * 1000);
  writeMaintenanceDateTime('maintStart', start);
  writeMaintenanceDateTime('maintEnd', end);
  selectedMaintenanceType = currentMaintenanceType();
  document.querySelectorAll('.maint-duration-btn').forEach((btn) => {
    btn.classList.toggle('is-active', Number(btn.getAttribute('data-maint-hours')) === hrs);
  });
  renderMaintenanceTable();
  setText('maintHint',
    'Editing ' + currentMaintenanceType() + ' · ' + hrs + 'h window · ' +
    formatDateTime24h(start) + ' → ' + formatDateTime24h(end) + ' ' + DISPLAY_TZ_LABEL);
}

function setMaintenanceFieldToNow(prefix) {
  const now = new Date();
  writeMaintenanceDateTime(prefix, now);
  clearMaintDurationSelection();
  selectedMaintenanceType = currentMaintenanceType();
  renderMaintenanceTable();
  setText('maintHint',
    'Editing ' + currentMaintenanceType() + ' · ' + (prefix === 'maintStart' ? 'start' : 'end') +
    ' set to ' + toTimeInputValue(now) + ' ' + DISPLAY_TZ_LABEL);
}

function fillMaintenanceForm(row) {
  if (!row) return;
  const type = apiField(row, 'maintenanceType', 'Backend');
  selectedMaintenanceType = String(type);
  setInputValue('maintType', type);
  setMaintenanceDateTime('maintStart', apiField(row, 'startTime'));
  setMaintenanceDateTime('maintEnd', apiField(row, 'endTime'));
  clearMaintDurationSelection();
  setText('maintHint', 'Editing ' + type + ' · currently ' + MAINTENANCE_STATE_BADGES[maintenanceState(row)][0]);
  renderMaintenanceTable();
}

function selectMaintenanceType(type) {
  const row = maintenanceSettingsData.find((r) => String(apiField(r, 'maintenanceType')) === String(type));
  if (row) {
    fillMaintenanceForm(row);
  } else {
    selectedMaintenanceType = String(type || '');
    renderMaintenanceTable();
  }
}

function isSelectedMaintenanceRow(row) {
  return !!selectedMaintenanceType && String(apiField(row, 'maintenanceType', '')) === selectedMaintenanceType;
}

const MAINTENANCE_COLUMNS = [
  { label: 'Type', render: (r) => '<strong>' + escHtml(apiField(r, 'maintenanceType', '—')) + '</strong>' },
  { label: 'Status', render: maintenanceStateBadge },
  { label: 'Start', render: (r) => renderDateTime24hHtml(apiField(r, 'startTime')) },
  { label: 'End', render: (r) => renderDateTime24hHtml(apiField(r, 'endTime')) },
  { label: 'Updated', render: (r) => renderDateTime24hHtml(apiField(r, 'lastUpdatedAt')) },
  { label: 'By', render: (r) => apiField(r, 'updatedBy', '') ? escHtml(apiField(r, 'updatedBy', '')) : EMPTY_CELL_HTML },
  {
    label: 'Edit',
    align: 'center',
    render: (r) => {
      const selected = isSelectedMaintenanceRow(r);
      return '<button type="button" class="secondary sm' + (selected ? ' is-active' : '') +
        '" data-maint-edit="' + escAttr(String(apiField(r, 'maintenanceType', ''))) + '">' +
        (selected ? 'Selected' : 'Select') + '</button>';
    },
  },
];

function renderMaintenanceTable() {
  if (!maintenanceLoaded) return;
  setRowCount('countMaintenance', maintenanceSettingsData);
  renderTable('maintenanceTableWrap', maintenanceSettingsData, MAINTENANCE_COLUMNS, 'No maintenance rows.', {
    getRowClass: (r) => (isSelectedMaintenanceRow(r) ? 'maint-row-selected' : ''),
  });
}

async function loadMaintenanceSettings() {
  if (isDemoMode()) {
    maintenanceSettingsData = getDemoMaintenanceSettings();
    maintenanceLoaded = true;
    renderMaintenanceTable();
    return;
  }
  const btn = $('maintenanceReloadBtn');
  if (btn) btn.disabled = true;
  if (!maintenanceLoaded) setHtml('maintenanceTableWrap', skeletonHtml(3));
  else $('maintenanceTableWrap')?.classList.add('is-loading');
  try {
    const json = await fetchApiJson(MAINTENANCE_PATH);
    maintenanceSettingsData = Array.isArray(json.data) ? json.data : (json.data?.items || []);
    maintenanceLoaded = true;
    renderMaintenanceTable();
  } catch (err) {
    maintenanceSettingsData = [];
    maintenanceLoaded = false;
    setText('countMaintenance', '');
    setHtml('maintenanceTableWrap', errorHtml('Failed to load maintenance settings: ' + (err.message || 'unknown error')));
  } finally {
    if (btn) btn.disabled = false;
    $('maintenanceTableWrap')?.classList.remove('is-loading');
  }
}

/** First problem with the start/end inputs, or '' when they are valid. */
function maintenanceFormError(startValue, endValue) {
  const badTime = (id) => ($(id)?.value || '').trim() && !normalizeTime24h($(id).value);
  if (badTime('maintStartTime')) return 'Start time must be 24-hour HH:mm (e.g. 21:05).';
  if (badTime('maintEndTime')) return 'End time must be 24-hour HH:mm (e.g. 21:05).';
  if (!startValue) return 'Start date and 24h time (HH:mm) are required when enabling maintenance.';
  if (endValue && parseUtc(endValue) <= parseUtc(startValue)) return 'End must be after start.';
  return '';
}

function maintenanceWindowText(startValue, endValue) {
  const start = formatDateTime24h(startValue);
  const end = endValue ? formatDateTime24h(endValue) : 'no end';
  return start + ' → ' + end + ' ' + DISPLAY_TZ_LABEL;
}

function confirmTurnOn() {
  const type = currentMaintenanceType();
  const startValue = getMaintenanceDateTime('maintStart');
  const endValue = getMaintenanceDateTime('maintEnd');
  const error = maintenanceFormError(startValue, endValue);
  if (error) {
    setError(error);
    return;
  }
  setError('');
  openConfirm({
    title: 'Turn on maintenance?',
    message: type + ' will be in maintenance ' + maintenanceWindowText(startValue, endValue) +
      ' (stored as UTC ' + startValue + ' → ' + (endValue || 'no end') + ').',
    confirmLabel: 'Turn On',
    danger: true,
    onConfirm: () => saveMaintenanceSetting({ isOn: true, type, startValue, endValue }),
  });
}

function confirmTurnOff() {
  const type = currentMaintenanceType();
  openConfirm({
    title: 'Turn off maintenance?',
    message: type + ' will go Live immediately and its maintenance window will be cleared.',
    confirmLabel: 'Turn Off',
    onConfirm: () => saveMaintenanceSetting({ isOn: false, type }),
  });
}

/** POST /maintenance; errors come back as `{ message }`, `{ title }` or ASP.NET `{ errors: { field: [..] } }`. */
async function postMaintenanceSetting(body) {
  const res = await fetchWithTimeout(apiUrl(INTERNAL_API + MAINTENANCE_PATH), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch {
    throw new Error('Response is not valid JSON.\n' + text.slice(0, 300));
  }
  if (!res.ok || !json?.success) {
    let msg = json?.message || json?.title || ('HTTP ' + res.status);
    if (json?.errors && typeof json.errors === 'object') {
      const parts = Object.values(json.errors).flat().filter(Boolean);
      if (parts.length) msg = parts.join(' ');
    }
    throw new Error(msg);
  }
}

function clearMaintenanceForm() {
  setMaintenanceDateTimeInputs('maintStart', '', '');
  setMaintenanceDateTimeInputs('maintEnd', '', '');
  clearMaintDurationSelection();
}

async function saveMaintenanceSetting({ isOn, type, startValue = null, endValue = null }) {
  selectedMaintenanceType = type;
  const body = {
    maintenanceType: type,
    isMaintenance: isOn,
    startTime: isOn ? startValue : null,
    endTime: isOn ? endValue : null,
  };

  if (isDemoMode()) {
    maintenanceSettingsData = maintenanceSettingsData.map((row) => {
      if (String(apiField(row, 'maintenanceType')) !== type) return row;
      return { ...row, ...body, updatedBy: 'demo', lastUpdatedAt: new Date().toISOString() };
    });
    renderMaintenanceTable();
    clearMaintenanceForm();
    showToast('Demo maintenance saved for ' + type);
    return;
  }

  const buttons = [$('maintSaveBtn'), $('maintClearBtn')];
  buttons.forEach((b) => { if (b) b.disabled = true; });
  try {
    setError('');
    await postMaintenanceSetting(body);
    showToast((isOn ? 'Maintenance ON' : 'Maintenance OFF') + ' · ' + type);
    clearMaintenanceForm();
    setText('maintHint', 'Saved ' + type + '.');
    await loadMaintenanceSettings();
  } catch (err) {
    setError(err.message || 'Failed to save maintenance setting');
    showToast('Save failed', 'err');
  } finally {
    buttons.forEach((b) => { if (b) b.disabled = false; });
  }
}

function normalizeTimeInputOnBlur(id) {
  $(id)?.addEventListener('blur', () => {
    const normalized = normalizeTime24h($(id).value);
    if (normalized) $(id).value = normalized;
  });
}

function bindMaintenanceEvents() {
  $('maintenanceReloadBtn')?.addEventListener('click', () => loadMaintenanceSettings());
  $('maintSaveBtn')?.addEventListener('click', confirmTurnOn);
  $('maintClearBtn')?.addEventListener('click', confirmTurnOff);
  $('maintType')?.addEventListener('change', () => selectMaintenanceType($('maintType').value));
  $('maintStartNowBtn')?.addEventListener('click', () => setMaintenanceFieldToNow('maintStart'));
  $('maintEndNowBtn')?.addEventListener('click', () => setMaintenanceFieldToNow('maintEnd'));
  document.querySelectorAll('.maint-duration-btn').forEach((btn) => {
    btn.addEventListener('click', () => setMaintenanceDuration(btn.getAttribute('data-maint-hours')));
  });
  normalizeTimeInputOnBlur('maintStartTime');
  normalizeTimeInputOnBlur('maintEndTime');
  $('maintenanceTableWrap')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-maint-edit]');
    if (btn) selectMaintenanceType(btn.getAttribute('data-maint-edit'));
  });
}
