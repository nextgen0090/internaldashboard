// Home dashboard: summary loading, response history, diff view, KPI cards and page switching.

// ---- Response history ----

// Last few distinct summary responses (newest first), used by the history dropdown and diff view.

const HISTORY_MAX = 3;
let responseHistory = [];
let historyViewIndex = 0;

function historyOptionLabel(index, loadedAt) {
  const time = formatTime(loadedAt);
  if (index === 0) return 'Latest · ' + time;
  const n = index + 1;
  const suffix = n === 2 ? '2nd last' : n === 3 ? '3rd last' : n + 'th last';
  return suffix + ' · ' + time;
}

function clearResponseHistory() {
  responseHistory = [];
  historyViewIndex = 0;
  lastSummaryEtag = '';
  lastSummaryJson = null;
  lastSummaryFingerprint = '';
  updateHistoryDropdown();
  updateDiffPanel();
}

function summaryFingerprint(response) {
  return JSON.stringify(response?.data ?? response);
}

/** Adds a new history entry, or only refreshes the latest timestamp when the payload is identical. */
function pushResponseHistory(response, fingerprint) {
  if (responseHistory.length && responseHistory[0].fingerprint === fingerprint) {
    responseHistory[0].loadedAt = new Date();
    updateHistoryDropdown();
    return;
  }
  // Responses are freshly parsed and never mutated, so entries can share them.
  responseHistory.unshift({ response, fingerprint, loadedAt: new Date() });
  if (responseHistory.length > HISTORY_MAX) responseHistory.length = HISTORY_MAX;
  historyViewIndex = 0;
  updateHistoryDropdown();
  updateDiffPanel();
}

function updateHistoryDropdown() {
  const sel = $('responseHistory');
  const hasHistory = responseHistory.length > 0;
  sel.disabled = !hasHistory || isDemoMode();
  show($('historyField'), !isDemoMode());

  const html = hasHistory
    ? responseHistory.map((entry, i) =>
      '<option value="' + i + '">' + historyOptionLabel(i, entry.loadedAt) + '</option>'
    ).join('')
    : '<option value="0">No history yet</option>';
  setHtml(sel, html);
  sel.value = String(hasHistory ? Math.min(historyViewIndex, responseHistory.length - 1) : 0);
}

function showHistoryAt(index) {
  if (!responseHistory.length) return;
  historyViewIndex = Math.max(0, Math.min(index, responseHistory.length - 1));
  const entry = responseHistory[historyViewIndex];
  renderDashboard(entry.response);
  if (drillStack.length) refreshOpenDrillFromLatest();
  renderSyncStatus();
  $('responseHistory').value = String(historyViewIndex);
}

/** The summary the Overview should show: the selected history entry, else the latest (or demo) data. */
function currentSummaryResponse() {
  if (isDemoMode()) return DEMO_SUMMARY;
  return responseHistory[historyViewIndex]?.response || lastSummaryJson;
}

// ---- Summary loading ----

// Loads the internal summary (API or demo) and drives the auto-refresh countdown.

const REFRESH_INTERVAL_SEC = 20;

let lastSummaryEtag = '';
let lastSummaryJson = null;
let lastSummaryFingerprint = '';
let secondsLeft = REFRESH_INTERVAL_SEC;
let isSummaryLoading = false;
let isRefreshPaused = false;
let isTabHidden = document.hidden;

function updateDataSourceUi() {
  const demo = isDemoMode();
  show($('dataSourceField'), isLocalDevHost());
  show($('demoPill'), demo);
  setHtml('subtitle', demo
    ? 'Demo mode — local sample data, no API calls'
    : 'Source <code>' + escHtml(apiUrl(INTERNAL_API + '/summary')) + '</code> · auto-refresh ' + REFRESH_INTERVAL_SEC + 's');
  updateHistoryDropdown();
  updatePauseButtonUi();
  updateDiffPanel();
}

/**
 * A summary is stored, diffed and re-rendered, so one malformed payload must not break later views:
 * list fields that are present but not arrays become [], and non-object rows are dropped.
 * Well-formed payloads are left exactly as received.
 */
function normalizeSummaryResponse(json) {
  const d = json?.data;
  if (!d || typeof d !== 'object') return json;
  const cleanList = (obj, key) => {
    if (obj[key] == null) return [];
    if (!Array.isArray(obj[key]) || obj[key].some((r) => !r || typeof r !== 'object')) {
      obj[key] = Array.isArray(obj[key]) ? obj[key].filter((r) => r && typeof r === 'object') : [];
    }
    return obj[key];
  };
  const cleanSessions = (rows) => rows.forEach((u) => cleanList(u, 'sessions').forEach((s) => cleanList(s, 'spinLogs')));
  cleanList(d, 'rtpByGame').forEach((g) => cleanSessions(cleanList(g, 'users')));
  cleanSessions(cleanList(d, 'rtpByUser'));
  ['gamesAboveTargetRtp', 'usersRtpAboveOrEqualOne', 'gamesTargetRtp'].forEach((key) => cleanList(d, key));
  cleanList(d, 'userFeedbacks').forEach((u) => cleanList(u, 'feedbacks'));
  if (d.totalGameUsers && typeof d.totalGameUsers === 'object') cleanList(d.totalGameUsers, 'users');
  return json;
}

async function fetchSummary({ forceFresh = false } = {}) {
  const base = apiUrl(INTERNAL_API + '/summary');
  const url = forceFresh ? base + '?_=' + Date.now() : base;

  const headers = {
    Accept: 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
  // Only send the ETag on background refresh; manual Load always asks for a full body.
  if (!forceFresh && lastSummaryEtag) {
    headers['If-None-Match'] = lastSummaryEtag;
  }

  const res = await fetchWithTimeout(url, { headers, cache: 'no-store' });
  if (res.status === 304) return { notModified: true };

  const json = normalizeSummaryResponse(parseApiResponse(res, await res.text()));
  const etag = res.headers.get('ETag') || res.headers.get('etag');
  if (etag) lastSummaryEtag = etag;
  return { notModified: false, json };
}

// ---- Sync status (header) ----

/**
 * When the data last changed, when it was last checked, how that check ended, whether it found
 * no changes, and the last refresh error ('' once a check succeeds again).
 */
const syncInfo = { updatedAt: null, checkedAt: null, result: '', unchanged: false, error: '' };

function resetSyncInfo() {
  Object.assign(syncInfo, { updatedAt: null, checkedAt: null, result: '', unchanged: false, error: '' });
}

function relativeTime(date) {
  const s = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  return m < 60 ? m + 'm ago' : formatTime(date);
}

function noteSync(changed, result) {
  const now = new Date();
  syncInfo.checkedAt = now;
  if (changed || !syncInfo.updatedAt) syncInfo.updatedAt = now;
  syncInfo.result = result;
  syncInfo.unchanged = !changed;
  syncInfo.error = '';
  renderSyncStatus();
}

/** The one place that decides the header status: [data-state, label, detail line]. */
function syncState() {
  const { updatedAt, checkedAt, unchanged, error } = syncInfo;
  const updated = updatedAt ? 'Updated ' + relativeTime(updatedAt) : 'No data yet';
  if (isDemoMode()) return ['ok', 'Demo', updated + ' · sample data'];
  if (isSummaryLoading) return ['busy', 'Updating', lastSummaryJson ? 'Checking for changes…' : 'Loading summary…'];
  if (error) {
    const retry = isRefreshPaused || isTabHidden ? 'auto-refresh paused' : 'retry in ' + secondsLeft + 's';
    return ['err', 'Error', (updatedAt ? 'Showing data from ' + relativeTime(updatedAt) : 'No data') + ' · ' + retry];
  }
  if (historyViewIndex > 0 && responseHistory[historyViewIndex]) {
    return ['idle', 'History', 'Viewing ' + historyOptionLabel(historyViewIndex, responseHistory[historyViewIndex].loadedAt)];
  }
  if (isRefreshPaused || isTabHidden) return ['paused', 'Paused', updated + (isTabHidden ? ' · tab hidden' : ' · auto-refresh off')];
  if (!updatedAt) return ['idle', 'Not loaded', ''];
  if (unchanged && checkedAt) return ['ok', 'Live', 'No changes · ' + updated.toLowerCase()];
  return ['ok', 'Live', updated];
}

/** Ticks every second; only writes what changed. */
function renderSyncStatus() {
  const [state, label, detail] = syncState();
  setConnectionStatus(state, label);
  setText('syncDetail', detail);
  const { updatedAt, checkedAt, result, error } = syncInfo;
  const tip = [
    error ? 'Last refresh failed: ' + error.split('\n')[0] : '',
    updatedAt ? 'Data changed: ' + formatDateTime(updatedAt) : 'No data loaded yet',
    checkedAt ? 'Last check: ' + formatDateTime(checkedAt) + (result ? ' — ' + result : '') : '',
    isDemoMode() ? 'Demo mode: no API calls' : 'Checks every ' + REFRESH_INTERVAL_SEC + 's with ETag (304 = unchanged, nothing re-rendered)',
  ].filter(Boolean).join('\n');
  const pill = $('statusPill');
  if (pill && pill.dataset.tip !== tip) pill.dataset.tip = tip;
}

function setSyncing(active) {
  document.querySelector('.app-header')?.classList.toggle('is-syncing', active);
}

function reportUpToDate(isAutoRefresh, result = '304 Not Modified') {
  noteSync(false, result);
  setError('');
  pushLiveSample(lastSummaryJson?.data);
  refreshLiveWidgets();
  if (!isAutoRefresh) showToast('No changes since ' + formatTime(syncInfo.updatedAt), 'info');
}

function applySummaryResponse(json, isAutoRefresh, { forceApply = false } = {}) {
  const fingerprint = summaryFingerprint(json);
  const changed = fingerprint !== lastSummaryFingerprint;
  lastSummaryJson = json;
  lastSummaryFingerprint = fingerprint;

  if (!changed && !forceApply) {
    reportUpToDate(isAutoRefresh, '200 OK · same data');
    return;
  }

  pushLiveSample(json.data);
  pushResponseHistory(json, fingerprint);
  renderDashboard(json);
  if (drillStack.length) refreshOpenDrillFromLatest();
  noteSync(changed, changed ? '200 OK · new data' : '200 OK · same data');
  setError('');
  const time = formatTime(new Date());
  if (changed) showToast((isAutoRefresh ? 'New data' : 'Data loaded') + ' at ' + time);
  else showToast('No changes at ' + time, 'info');
}

function updatePauseButtonUi() {
  const btn = $('pauseRefreshBtn');
  if (!btn) return;
  show(btn, !isDemoMode());
  btn.textContent = isRefreshPaused ? 'Resume' : 'Pause';
  updateControlsHighlight();
}

function toggleRefreshPaused() {
  isRefreshPaused = !isRefreshPaused;
  updatePauseButtonUi();
  updateRefreshTimer();
  renderSyncStatus();
}

/** Countdown ring: seconds until the next check; click to refresh now. */
function updateRefreshTimer() {
  const el = $('refreshTimer');
  const demo = isDemoMode();
  const paused = !demo && (isRefreshPaused || isTabHidden);
  let fraction = secondsLeft / REFRESH_INTERVAL_SEC;
  let label;
  let tip;
  if (demo) { label = '—'; tip = 'Auto-refresh is off in demo mode'; fraction = 0; }
  else if (isSummaryLoading) { label = ''; tip = 'Checking for new data…'; fraction = 1; }
  else if (isTabHidden) { label = 'II'; tip = 'Auto-refresh paused while this tab is hidden'; }
  else if (isRefreshPaused) { label = 'II'; tip = 'Auto-refresh paused (' + secondsLeft + 's left) · click to refresh now'; }
  else { label = String(secondsLeft); tip = 'Next check in ' + secondsLeft + 's · click to refresh now'; }

  el.classList.toggle('is-off', demo);
  el.classList.toggle('is-paused', paused);
  el.classList.toggle('is-busy', !demo && isSummaryLoading);
  el.disabled = demo || isSummaryLoading;
  setText('refreshText', label);
  if (el.dataset.tip !== tip) el.dataset.tip = tip;
  $('refreshBar').style.strokeDashoffset = String(100 - Math.max(0, Math.min(1, fraction)) * 100);
}

function resetRefreshTimer() {
  secondsLeft = REFRESH_INTERVAL_SEC;
  updateRefreshTimer();
}

function startRefreshClock() {
  setInterval(() => {
    renderSyncStatus();
    if (isDemoMode() || isSummaryLoading || isRefreshPaused || isTabHidden) return;
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      loadData(true);
      return;
    }
    updateRefreshTimer();
  }, 1000);
}

function loadDemoData(isAutoRefresh = false) {
  setError('');
  clearResponseHistory();
  pushLiveSample(DEMO_SUMMARY.data);
  renderDashboard(DEMO_SUMMARY);
  if (drillStack.length) refreshOpenDrillFromLatest();
  const time = formatTime(new Date());
  noteSync(true, 'sample data');
  if (!isAutoRefresh) showToast('Demo data loaded at ' + time, 'info');
  updateRefreshTimer();
}

/** Turn low-level fetch/proxy errors into setup hints for the person running the dashboard. */
function describeSummaryLoadError(err) {
  const msg = err.message || String(err);
  const isLocal = isLocalDevHost();
  if (msg === 'STATIC_404') {
    return 'You started python -m http.server — that cannot proxy /api.\n\n'
      + 'Close that terminal (Ctrl+C), then double-click start.bat in this folder.';
  }
  if (msg === 'Failed to fetch') {
    return isLocal
      ? ('Cannot reach API.\n\n'
        + '1. .NET backend must run on http://localhost:5036\n'
        + '2. Double-click start.bat (not python -m http.server)\n'
        + '3. Or switch Source to Demo to preview without the backend')
      : ('Cannot reach API.\n\n'
        + 'Dashboard calls https://gamevault222.com/api/ directly.\n'
        + 'Check that the live API is up and CORS allows this site.');
  }
  if (/Proxy error/i.test(msg) || /WinError 10061/i.test(msg)) {
    return isLocal
      ? ('Backend not reachable at http://localhost:5036\n\n'
        + 'Start the .NET API, then click Load or wait for auto-refresh.')
      : ('Backend not reachable at https://gamevault222.com\n\n'
        + 'Check the live API, then click Load or wait for auto-refresh.');
  }
  return msg;
}

async function loadApiData(isAutoRefresh = false) {
  isSummaryLoading = true;
  const hasData = !!lastSummaryJson;
  if (!isAutoRefresh) {
    setError('');
    $('loadBtn').disabled = true;
    if (!hasData) renderDashboardSkeleton();
  }
  setSyncing(true);
  renderSyncStatus();
  updateRefreshTimer();

  try {
    // Manual Load always bypasses ETag/304 and browser cache, and always redraws the UI.
    const forceFresh = !isAutoRefresh;
    const result = await fetchSummary({ forceFresh });
    // Source switched to Demo while this request was in flight: its response no longer applies.
    if (isDemoMode()) return;
    if (result.notModified) {
      reportUpToDate(isAutoRefresh);
    } else {
      applySummaryResponse(result.json, isAutoRefresh, { forceApply: forceFresh });
    }
    checkOpenDrillForUpdates();
    resetRefreshTimer();
  } catch (err) {
    if (isDemoMode()) return;
    const msg = describeSummaryLoadError(err);
    syncInfo.checkedAt = new Date();
    syncInfo.result = 'failed: ' + (err.message || 'error');
    syncInfo.error = msg;
    // Keep the last good data on screen; the status shows how old it is and when the retry runs.
    if (!hasData || !isAutoRefresh) setError(msg);
    if (!hasData) show($('dashboard'), false);
    resetRefreshTimer();
  } finally {
    setSyncing(false);
    isSummaryLoading = false;
    if (!isAutoRefresh) $('loadBtn').disabled = false;
    updateRefreshTimer();
    renderSyncStatus();
  }
}

async function loadData(isAutoRefresh = false) {
  // Demo is synchronous, so switching to it is never blocked by an API request still in flight.
  if (isDemoMode()) {
    updateDataSourceUi();
    loadDemoData(isAutoRefresh);
    return;
  }
  if (isSummaryLoading) return;
  updateDataSourceUi();
  await loadApiData(isAutoRefresh);
}

// ---- Diff view ----

// "Show Diff": field-level changes between the latest and previous summary responses.

const RTP_DIFF_FIELDS = [
  { key: 'totalBet', label: 'Total Bet' },
  { key: 'totalWin', label: 'Total Win' },
  { key: 'totalSpin', label: 'Spins' },
  { key: 'rtp', label: 'RTP' },
];
const TARGET_RTP_DIFF_FIELD = { key: 'targetRtp', label: 'Target RTP' };

const ARRAY_DIFF_CONFIGS = [
  { title: 'RTP by Game', arrayKey: 'rtpByGame', idKey: 'gameName', fields: [...RTP_DIFF_FIELDS, TARGET_RTP_DIFF_FIELD] },
  { title: 'RTP by User', arrayKey: 'rtpByUser', idKey: 'username', fields: RTP_DIFF_FIELDS },
  { title: 'Games Above Target RTP', arrayKey: 'gamesAboveTargetRtp', idKey: 'gameName', fields: [...RTP_DIFF_FIELDS, TARGET_RTP_DIFF_FIELD] },
  { title: 'Users RTP ≥ 100%', arrayKey: 'usersRtpAboveOrEqualOne', idKey: 'username', fields: RTP_DIFF_FIELDS },
  { title: 'Game Target RTP', arrayKey: 'gamesTargetRtp', idKey: 'gameName', fields: [TARGET_RTP_DIFF_FIELD] },
  {
    title: 'User Feedbacks',
    arrayKey: 'userFeedbacks',
    idKey: 'userId',
    fields: [
      { key: 'username', label: 'Username' },
      { key: 'feedBackCount', label: 'Feedback Count' },
      { key: 'avgRating', label: 'Avg Rating' },
      { key: 'feedbacks', label: 'Feedbacks' },
    ],
  },
];

const SUMMARY_DIFF_FIELDS = [
  { key: 'totalRecharged', label: 'Total Recharged' },
  { key: 'totalRedeemed', label: 'Total Redeemed' },
  { key: 'ownerTotalRecharged', label: 'Owner Total Recharged' },
  { key: 'ownerTotalRedeemed', label: 'Owner Total Redeemed' },
  { key: 'ownerTotalGenerated', label: 'Owner Total Generated' },
  { key: 'totalUsers', label: 'Total Users' },
  { key: 'totalGameUsers', label: 'Online Users' },
];

const WHOLE_GAME_RTP_DIFF_FIELDS = [
  { key: 'totalBet', label: 'Total Bet' },
  { key: 'totalWin', label: 'Total Win' },
  { key: 'rtp', label: 'RTP' },
];

const DIFF_MONEY_KEYS = new Set([
  'totalBet', 'totalWin', 'totalRecharged', 'totalRedeemed',
  'ownerTotalRecharged', 'ownerTotalRedeemed', 'ownerTotalGenerated',
]);

/** Diff of the two newest history entries, recomputed only when those entries change. */
let diffCache = null;

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-9;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatDiffValue(fieldKey, value) {
  if (value == null || value === '') return '—';
  if (fieldKey === 'rtp' || fieldKey === 'targetRtp') return fmtRtp(value);
  if (DIFF_MONEY_KEYS.has(fieldKey)) return '$' + fmtMoney(value);
  if (fieldKey === 'totalSpin' || fieldKey === 'feedBackCount') return fmtInt(value);
  if (fieldKey === 'totalGameUsers') return fmtInt(gameUsersCount(value));
  if (fieldKey === 'avgRating') return Number(value).toFixed(1);
  if (fieldKey === 'feedbacks') {
    if (!Array.isArray(value) || value.length === 0) return '—';
    return value.map((f) => Number(f.ratingStar || 0) + '/5: ' + feedbackText(f)).join(' · ');
  }
  return String(value);
}

function diffArraySection(oldArr, newArr, idKey, fields) {
  const oldMap = new Map((Array.isArray(oldArr) ? oldArr : []).map((r) => [String(r[idKey]), r]));
  const newMap = new Map((Array.isArray(newArr) ? newArr : []).map((r) => [String(r[idKey]), r]));
  const rows = [];

  for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
    const oldRow = oldMap.get(id);
    const newRow = newMap.get(id);
    for (const f of fields) {
      if (!oldRow) {
        rows.push({ item: id, field: f.label, oldVal: '—', newVal: formatDiffValue(f.key, newRow[f.key]), change: 'added' });
      } else if (!newRow) {
        rows.push({ item: id, field: f.label, oldVal: formatDiffValue(f.key, oldRow[f.key]), newVal: '—', change: 'removed' });
      } else if (!valuesEqual(oldRow[f.key], newRow[f.key])) {
        rows.push({
          item: id,
          field: f.label,
          oldVal: formatDiffValue(f.key, oldRow[f.key]),
          newVal: formatDiffValue(f.key, newRow[f.key]),
          change: 'changed',
        });
      }
    }
  }
  return rows;
}

function computeFullDiff(previousResponse, latestResponse) {
  const sections = [];
  const oldD = previousResponse?.data || {};
  const newD = latestResponse?.data || {};
  const summaryRows = [];

  for (const s of SUMMARY_DIFF_FIELDS) {
    const comparable = (d) => (s.key === 'totalGameUsers' ? gameUsersCount(d[s.key]) : d[s.key]);
    if (!valuesEqual(comparable(oldD), comparable(newD))) {
      summaryRows.push({
        item: 'Summary',
        field: s.label,
        oldVal: formatDiffValue(s.key, oldD[s.key]),
        newVal: formatDiffValue(s.key, newD[s.key]),
        change: 'changed',
      });
    }
  }

  for (const f of WHOLE_GAME_RTP_DIFF_FIELDS) {
    const oldVal = oldD.wholeGameRtp?.[f.key];
    const newVal = newD.wholeGameRtp?.[f.key];
    if (!valuesEqual(oldVal, newVal)) {
      summaryRows.push({
        item: 'Whole Game RTP',
        field: f.label,
        oldVal: formatDiffValue(f.key, oldVal),
        newVal: formatDiffValue(f.key, newVal),
        change: 'changed',
      });
    }
  }

  if (summaryRows.length) {
    sections.push({ title: 'Summary', rows: summaryRows });
  }

  for (const cfg of ARRAY_DIFF_CONFIGS) {
    const rows = diffArraySection(oldD[cfg.arrayKey], newD[cfg.arrayKey], cfg.idKey, cfg.fields);
    if (rows.length) sections.push({ title: cfg.title, rows });
  }

  return sections;
}

function latestDiff() {
  const latest = responseHistory[0];
  const previous = responseHistory[1];
  if (!diffCache || diffCache.latest !== latest || diffCache.previous !== previous) {
    const sections = computeFullDiff(previous.response, latest.response);
    diffCache = {
      latest,
      previous,
      sections,
      changeCount: sections.reduce((n, s) => n + s.rows.length, 0),
    };
  }
  return diffCache;
}

function renderDiffSection(section) {
  const head = '<tr><th>Item</th><th>Field</th><th class="num">Previous</th><th class="num">New</th></tr>';
  const body = section.rows.map((r) =>
    '<tr class="diff-' + r.change + '">' +
    '<td>' + escHtml(r.item) + '</td>' +
    '<td>' + escHtml(r.field) + '</td>' +
    '<td class="num diff-old">' + escHtml(r.oldVal) + '</td>' +
    '<td class="num diff-new">' + escHtml(r.newVal) + '</td>' +
    '</tr>'
  ).join('');
  return '<div class="diff-section"><h3>' + escHtml(section.title) + ' · ' + countLabel(section.rows.length, 'change') + '</h3>' +
    '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></div>';
}

function updateDiffPanel() {
  const btn = $('toggleDiffBtn');
  const canDiff = !isDemoMode() && responseHistory.length >= 2;

  if (btn) {
    show(btn, !isDemoMode());
    btn.disabled = !canDiff;
    btn.dataset.tip = canDiff ? 'Compare the latest response with the previous one' : 'Needs two different responses';
  }

  if (!canDiff) {
    isDiffVisible = false;
    if (btn) btn.textContent = 'Show Diff';
    setDashboardViewMode();
    return;
  }

  const { previous, latest, sections, changeCount } = latestDiff();
  setText('diffMeta', 'Previous (' + formatTime(previous.loadedAt) + ') → Latest (' + formatTime(latest.loadedAt) + ')');

  if (btn) {
    btn.textContent = (isDiffVisible ? 'Hide Diff' : 'Show Diff') + (changeCount ? ' (' + changeCount + ')' : '');
  }

  if (isDiffVisible) {
    setText('diffChangeCount', countLabel(changeCount, 'change'));
    setHtml('diffContent', changeCount
      ? sections.map(renderDiffSection).join('')
      : emptyHtml('No changes since the previous response — all values are the same.'));
  }

  setDashboardViewMode();
}

function toggleDiffView() {
  const next = !isDiffVisible;
  if (next) resetToBaseView();
  isDiffVisible = next;
  updateDiffPanel();
  if (isDiffVisible) window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- KPI cards and sections ----

// Home dashboard: KPI cards, section navigation and table data from the summary response.

/** Read totalGameUsers.count from the API payload (no recalculation). */
function gameUsersCount(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object') {
    const n = Number(value.count ?? value.Count);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function totalGameUsersPayload(data) {
  if (!data || typeof data !== 'object') return null;
  return data.totalGameUsers ?? data.TotalGameUsers ?? null;
}

/** Normalize totalGameUsers.users (camelCase or PascalCase). */
function gameUsersList(value) {
  if (!value || typeof value !== 'object') return [];
  const raw = Array.isArray(value.users)
    ? value.users
    : Array.isArray(value.Users)
      ? value.Users
      : [];
  return raw.map((u) => ({
    userId: apiField(u, 'userId', ''),
    username: apiField(u, 'username', ''),
    gameId: apiField(u, 'gameId', ''),
    gameName: apiField(u, 'gameName', ''),
  }));
}

// ---- Live samples ----

// One sample per successful summary check (including 304 "not modified"), kept in memory for the
// KPI / online sparklines. These are observed values, so trends start empty after a page load.

const LIVE_SAMPLE_MAX = 180;
let liveSamples = [];

function pushLiveSample(d) {
  if (!d) return;
  liveSamples.push({
    at: Date.now(),
    online: gameUsersCount(totalGameUsersPayload(d)),
    bet: Number(d.wholeGameRtp?.totalBet || 0),
    hold: rowHold(d.wholeGameRtp),
  });
  if (liveSamples.length > LIVE_SAMPLE_MAX) liveSamples.shift();
}

function clearLiveSamples() {
  liveSamples = [];
}

/** Sparkline for the latest data only; history views show the snapshot without a trend. */
function liveSpark(key, tone, response) {
  if (response !== currentLatestResponse() || liveSamples.length < 2) return '';
  return '<div class="kpi-spark"' + tipAttr('Trend over the last ' + liveSampleSpan() + ' (' + liveSamples.length + ' checks)') + '>' +
    sparklineHtml(liveSamples.map((s) => s[key]), tone) + '</div>';
}

function liveSampleSpan() {
  if (liveSamples.length < 2) return '';
  const minutes = Math.round((liveSamples[liveSamples.length - 1].at - liveSamples[0].at) / 60000);
  return minutes < 1 ? 'minute' : countLabel(minutes, 'minute');
}

function currentLatestResponse() {
  return isDemoMode() ? DEMO_SUMMARY : (responseHistory[0]?.response || lastSummaryJson);
}

// ---- KPI cards ----

/** "▲ $12.00 since last" style change vs the previous response; '' when unchanged or unknown. */
function kpiDelta(current, previous, format) {
  if (previous == null) return '';
  const diff = Number(current || 0) - Number(previous || 0);
  if (!Number.isFinite(diff) || Math.abs(diff) < 1e-9) return '';
  return '<span class="kpi-delta tone-' + (diff > 0 ? 'up' : 'down') + '">' + (diff > 0 ? '▲ ' : '▼ ') +
    escHtml(format(Math.abs(diff))) + '</span> since last';
}

function kpiLine(label, amount, tone) {
  return '<span class="kpi-line"><span>' + label + '</span>' + moneyHtml(amount, tone) + '</span>';
}

function signedMoney(n) {
  const v = moneyValue(n);
  return (v < 0 ? '−$' : '$') + fmtMoney(Math.abs(v));
}

function buildKpiCards(d, prev, response) {
  const money = (n) => '$' + fmtMoney(n);
  const whole = d.wholeGameRtp || {};
  const bet = Number(whole.totalBet || 0);
  const win = Number(whole.totalWin || 0);
  const hold = rowHold(whole);
  const rtp = rowRtp(whole);
  const prevWhole = prev?.wholeGameRtp;
  const recharged = Number(d.totalRecharged || 0);
  const redeemed = Number(d.totalRedeemed || 0);
  const net = moneyValue(recharged - redeemed);
  const online = gameUsersCount(totalGameUsersPayload(d));
  const totalUsers = Number(apiField(d, 'totalUsers', 0));
  const games = d.rtpByGame || [];
  const aboveTarget = games.filter(isAboveTarget).length;
  const belowTarget = games.length - aboveTarget;
  const rtpToneKey = rtp >= 1 ? 'down' : 'info';
  const action = (label, attrs, tip) => ({ label, attrs, tip });

  return [
    {
      label: 'Total bet',
      value: money(bet),
      tone: 'bet',
      sub: 'Total win ' + moneyHtml(win, 'up'),
      visual: liveSpark('bet', 'bet', response),
      delta: kpiDelta(bet, prevWhole?.totalBet, money),
      actions: [
        action('By game', ' data-explore="games-bet"', 'RTP by Game, sorted by bet'),
        action('By player', ' data-explore="users-bet"', 'RTP by User, sorted by bet'),
      ],
    },
    {
      label: 'Game hold',
      value: signedMoney(hold),
      tone: hold >= 0 ? 'up' : 'down',
      sub: 'Bet − win · house edge <b>' + (bet ? ((hold / bet) * 100).toFixed(2) : '0.00') + '%</b>',
      visual: liveSpark('hold', hold >= 0 ? 'up' : 'down', response),
      delta: prevWhole ? kpiDelta(hold, rowHold(prevWhole), money) : '',
      tip: 'Total bet minus total win across all games',
      actions: [action('Games by hold', ' data-explore="games-hold"', 'Which games produce the hold (or the loss)')],
    },
    {
      label: 'Whole game RTP',
      value: fmtRtp(rtp),
      tone: rtpToneKey,
      visual: meterHtml(rtp, { max: Math.max(1.5, rtp * 1.1), tone: rtpToneKey, marks: [{ at: 1, label: '100% · break-even' }] }),
      sub: games.length ? '<b>' + aboveTarget + '</b> of ' + games.length + ' games above target' : 'No game activity',
      delta: prevWhole ? kpiDelta(rtp * 100, rowRtp(prevWhole) * 100, (n) => n.toFixed(2) + ' pp') : '',
      actions: games.length ? [
        action('Above target · ' + aboveTarget, ' data-explore="games-above"', 'Games paying out more than their target RTP'),
        action('At/below · ' + belowTarget, ' data-explore="games-below"', 'Games at or under their target RTP'),
      ] : [],
    },
    {
      label: 'Player net cash',
      value: signedMoney(net),
      tone: net >= 0 ? 'up' : 'down',
      visual: splitBarHtml([
        { label: 'Recharged', value: recharged, tone: 'up' },
        { label: 'Redeemed', value: redeemed, tone: 'warn' },
      ], money, { legend: false }),
      sub: 'In ' + moneyHtml(recharged, 'up') + ' · out ' + moneyHtml(redeemed, 'warn'),
      delta: prev ? kpiDelta(net, Number(prev.totalRecharged || 0) - Number(prev.totalRedeemed || 0), money) : '',
      tip: 'Player recharges minus player redeems',
      actions: [action('Per-player lookup', ' data-nav="user-gameplay"', 'The summary API only has player totals; User Game Play shows recharge / redeem per player')],
    },
    {
      label: 'Online now',
      value: fmtInt(online),
      tone: 'info',
      sub: 'of ' + fmtInt(totalUsers) + ' registered' + (totalUsers ? ' · ' + ((online / totalUsers) * 100).toFixed(1) + '%' : ''),
      visual: liveSpark('online', 'info', response),
      delta: prev ? kpiDelta(online, gameUsersCount(totalGameUsersPayload(prev)), fmtInt) : '',
      actions: [action('Users & sessions', ' data-kpi="online-users"', 'Who is online, then their sessions')],
    },
    {
      label: 'Owner totals',
      value:
        kpiLine('Generated', apiField(d, 'ownerTotalGenerated'), 'purple') +
        kpiLine('Recharged', apiField(d, 'ownerTotalRecharged'), 'up') +
        kpiLine('Redeemed', apiField(d, 'ownerTotalRedeemed'), 'warn'),
      valueStack: true,
      tone: 'purple',
      actions: [action('Transactions', ' data-owner-tx="all"', 'Owner recharge / redeem / generated transactions')],
    },
  ];
}

function renderKpiCard(k) {
  const actions = (k.actions || []).map((a) =>
    '<button type="button" class="link-btn"' + a.attrs + tipAttr(a.tip) + '>' + escHtml(a.label) + ' →</button>'
  ).join('');
  return '<div class="kpi tone-' + k.tone + '"' + tipAttr(k.tip) + '>' +
    '<div class="kpi-label">' + k.label + '</div>' +
    '<div class="kpi-value' + (k.valueStack ? ' kpi-value-stack' : '') + '">' + k.value + '</div>' +
    (k.visual ? '<div class="kpi-visual">' + k.visual + '</div>' : '') +
    (k.sub ? '<div class="kpi-sub">' + k.sub + '</div>' : '') +
    (k.delta ? '<div class="kpi-foot">' + k.delta + '</div>' : '') +
    (actions ? '<div class="kpi-actions">' + actions + '</div>' : '') +
    '</div>';
}

function openKpi(kpiKey) {
  if (kpiKey === 'online-users') openOnlineUsers();
  else if (kpiKey === 'owner-totals') openOwnerTransactions();
}

// ---- Needs-attention bar ----

function allFeedbackEntries(d) {
  return (d.userFeedbacks || []).flatMap((u) =>
    getUserFeedbacksList(u).map((f) => ({ ...f, username: u.username || '' }))
  );
}

/** Days of feedback the low-rating alert looks at (today included). */
const LOW_RATING_ALERT_DAYS = 7;

/**
 * Only conditions someone should act on, each backed by summary data. Clicking an alert opens the
 * matching explorer tab with its filter and sort applied (see EXPLORER_PRESETS).
 */
function renderInsights(d) {
  const items = [];
  const plural = (n, one, many) => (n === 1 ? one : many);
  const wholeRtp = rowRtp(d.wholeGameRtp);
  if (wholeRtp >= 1) {
    items.push({ tone: 'down', count: fmtRtp(wholeRtp), text: 'whole-game RTP — paying out more than bet', preset: 'games-rtp' });
  }
  const above = (d.rtpByGame || []).filter(isAboveTarget).length;
  if (above) items.push({ tone: 'warn', count: above, text: plural(above, 'game above target RTP', 'games above target RTP'), preset: 'games-above' });
  const losing = (d.rtpByGame || []).filter((g) => rowHold(g) < 0).length;
  if (losing) items.push({ tone: 'down', count: losing, text: plural(losing, 'game losing money', 'games losing money'), preset: 'games-hold-loss', tip: 'Win greater than bet (negative hold)' });
  const high = (d.usersRtpAboveOrEqualOne || []).length;
  if (high) items.push({ tone: 'down', count: high, text: plural(high, 'player at ≥100% RTP', 'players at ≥100% RTP'), preset: 'users-high' });
  const since = shiftDayKey(-(LOW_RATING_ALERT_DAYS - 1));
  const low = allFeedbackEntries(d).filter((f) =>
    f.ratingStar != null && Number(f.ratingStar) <= LOW_RATING_MAX && isWithinDayRange(f.createdAt, since, '')
  ).length;
  if (low) items.push({ tone: 'down', count: low, text: plural(low, 'low rating', 'low ratings') + ' (≤' + LOW_RATING_MAX + '★, ' + LOW_RATING_ALERT_DAYS + 'd)', preset: 'feedback-low' });

  const chips = items.length
    ? items.map((i) =>
      '<button type="button" class="insight row-btn tone-' + i.tone + '" data-explore="' + i.preset + '"' + tipAttr(i.tip || 'Open filtered in Data explorer') + '>' +
      '<b>' + escHtml(String(i.count)) + '</b> ' + escHtml(i.text) + '<span aria-hidden="true">→</span></button>'
    ).join('')
    : '<span class="insight tone-up is-clear"><b>✓</b> All clear — no games above target, no losing games, no players at ≥100% RTP, no recent low ratings</span>';
  setHtml('insightsBar', '<span class="insights-label">Needs attention</span>' + chips);
}

// ---- Analytics panels ----

const GAME_PERF_LIMIT = 10;

/** Sort key → value getter and the matching RTP by Game column (for "View all"). */
const GAME_PERF_SORTS = {
  bet: { get: (g) => Number(g.totalBet || 0), column: 'Total Bet' },
  win: { get: (g) => Number(g.totalWin || 0), column: 'Total Win' },
  hold: { get: (g) => rowHold(g), column: 'Hold' },
  rtp: { get: (g) => rowRtp(g), column: 'RTP' },
  spins: { get: (g) => Number(g.totalSpin || 0), column: 'Spins' },
};
const gamePerfView = { sort: 'bet', dir: -1, filter: 'all' };

function setGamePerfSort(key) {
  if (!GAME_PERF_SORTS[key]) return;
  gamePerfView.dir = gamePerfView.sort === key ? -gamePerfView.dir : -1;
  gamePerfView.sort = key;
  renderGamePerformance(currentDashboardData || {});
}

function setGamePerfFilter(value) {
  gamePerfView.filter = value || 'all';
  renderGamePerformance(currentDashboardData || {});
}

function syncGamePerfControls() {
  document.querySelectorAll('#gpSort [data-gp-sort]').forEach((btn) => {
    const on = btn.dataset.gpSort === gamePerfView.sort;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = btn.textContent.replace(/ [▲▼]$/, '');
    const text = on ? label + (gamePerfView.dir > 0 ? ' ▲' : ' ▼') : label;
    if (btn.textContent !== text) btn.textContent = text;
  });
  setInputValue('gpFilter', gamePerfView.filter);
}

/** The explorer view that shows the same games, order and filter (game panel "View all"). */
function gamePerfExplorerPreset() {
  return {
    tab: 'sec-rtp-game',
    sort: GAME_PERF_SORTS[gamePerfView.sort].column,
    dir: gamePerfView.dir,
    filters: { rtpByGameStatusFilter: gamePerfView.filter },
  };
}

function renderGamePerformance(d) {
  syncGamePerfControls();
  const all = d.rtpByGame || [];
  if (!all.length) {
    setHtml('gamePerfChart', emptyHtml('No game activity yet.', { hint: 'Games appear here once players place bets.' }));
    return;
  }
  const filtered = all.filter((g) => matchesTargetStatus(g, gamePerfView.filter));
  if (!filtered.length) {
    setHtml('gamePerfChart', emptyHtml('No games ' + TARGET_STATUS_LABELS[gamePerfView.filter] + ' target RTP.', { hint: 'All ' + countLabel(all.length, 'game') + ' are on the other side of their target.' }));
    return;
  }
  const games = sortRows(filtered, GAME_PERF_SORTS[gamePerfView.sort].get, gamePerfView.dir);
  const shown = games.slice(0, GAME_PERF_LIMIT);
  const maxMoney = Math.max(...shown.flatMap((g) => [Number(g.totalBet || 0), Number(g.totalWin || 0)]));
  const rtpScale = Math.max(1.2, ...shown.map((g) => Math.max(rowRtp(g), Number(g.targetRtp || 0)) * 1.05));

  const rows = shown.map((g) => {
    const bet = Number(g.totalBet || 0);
    const win = Number(g.totalWin || 0);
    const hold = rowHold(g);
    const rtp = rowRtp(g);
    const target = Number(g.targetRtp || 0);
    const above = isAboveTarget(g);
    const tone = above ? 'warn' : 'up';
    const pp = rtpVsTarget(g);
    const canDrill = Number(g.totalSpin) > 0 && g.gameId;
    const tip = g.gameName + '\nBet $' + fmtMoney(bet) + ' · Win $' + fmtMoney(win) +
      '\nHold ' + signedMoney(hold) + ' · ' + fmtInt(g.totalSpin) + ' spins' +
      '\nRTP ' + fmtRtp(rtp) + ' vs target ' + fmtRtp(target) + ' (' + fmtPp(pp) + (above ? ', above' : '') + ')' +
      (canDrill ? '\nClick to view players' : '');
    const cls = 'gp-row' + (above ? ' is-above' : '');
    const open = canDrill
      ? '<button type="button" class="' + cls + ' row-btn" data-drill="game" data-id="' + escAttr(g.gameId) + '"' + tipAttr(tip) + '>'
      : '<div class="' + cls + '"' + tipAttr(tip) + '>';
    return open +
      '<span class="gp-name"><b>' + escHtml(g.gameName) + '</b><small>' + fmtInt(g.totalSpin) + ' spins</small></span>' +
      '<span class="gp-bars">' +
      '<span class="gp-bar tone-bet" style="width:' + pctOf(bet, maxMoney).toFixed(2) + '%"></span>' +
      '<span class="gp-bar tone-up" style="width:' + pctOf(win, maxMoney).toFixed(2) + '%"></span></span>' +
      '<span class="gp-money"><span class="val tone-bet">$' + fmtCompact(bet) + '</span><span class="val tone-up">$' + fmtCompact(win) + '</span></span>' +
      '<span class="gp-hold val tone-' + (hold >= 0 ? 'up' : 'down') + '">' + (hold >= 0 ? '+' : '−') + '$' + fmtCompact(Math.abs(hold)) + '</span>' +
      '<span class="gp-rtp"><span class="gp-rtp-line"><span class="val tone-' + tone + '">' + fmtRtp(rtp) + '</span>' +
      '<small class="val tone-' + (above ? 'warn' : 'flat') + '">' + fmtPp(pp) + '</small></span>' +
      meterHtml(rtp, { max: rtpScale, tone, marks: [{ at: target, label: 'Target ' + fmtRtp(target) }] }) + '</span>' +
      '<span class="gp-go' + (canDrill ? ' icon-btn' : '') + '" aria-hidden="true">' +
      (canDrill ? '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg>' : '') + '</span>' +
      (canDrill ? '</button>' : '</div>');
  }).join('');

  const scope = gamePerfView.filter === 'all' ? '' : ' ' + TARGET_STATUS_LABELS[gamePerfView.filter] + ' target';
  const foot = '<div class="chart-legend chart-legend-foot">' +
    '<span class="tone-bet"><i></i>Bet</span><span class="tone-up"><i></i>Win</span><span class="tone-flat is-mark"><i></i>Target RTP</span>' +
    '<span class="tone-warn is-edge"><i></i>Above target</span>' +
    '<button type="button" class="link-btn" data-explore="game-perf">' +
    (games.length > shown.length ? 'Showing ' + shown.length + ' of ' + games.length + scope + ' · View all' : 'Open in Data explorer') + ' →</button></div>';
  setHtml('gamePerfChart',
    '<div class="gp-table">' +
    '<div class="gp-row gp-head"><span>Game</span><span>Bet vs win</span><span class="num">Bet / win</span><span class="num">Hold</span><span>RTP vs target</span><span></span></div>' +
    rows + '</div>' + foot);
}

function renderCashflow(d) {
  const recharged = Number(d.totalRecharged || 0);
  const redeemed = Number(d.totalRedeemed || 0);
  const net = moneyValue(recharged - redeemed);
  const ownerRecharged = Number(apiField(d, 'ownerTotalRecharged', 0));
  const ownerRedeemed = Number(apiField(d, 'ownerTotalRedeemed', 0));
  const ratio = (out, inn) => (inn ? ((out / inn) * 100).toFixed(1) + '%' : '—');
  const money = (n) => '$' + fmtMoney(n);

  const ownerRow = (label, value, tone, type) => ({
    label, value, tone,
    attrs: ' data-owner-tx="' + type + '"',
    tip: 'Owner ' + label.toLowerCase() + ' $' + fmtMoney(value) + '\nClick to open these transactions',
  });

  setHtml('cashflowChart',
    '<div class="cf-block cf-player">' +
    '<div class="cf-head"><span>Player cash</span><strong class="val tone-' + (net >= 0 ? 'up' : 'down') + '">' + signedMoney(net) + '</strong><small>net in</small>' +
    '<button type="button" class="link-btn" data-nav="user-gameplay"' + tipAttr('Per-player recharge / redeem totals (the summary only has overall totals)') + '>Per player →</button></div>' +
    splitBarHtml([
      { label: 'Recharged', value: recharged, tone: 'up' },
      { label: 'Redeemed', value: redeemed, tone: 'warn' },
    ], money) +
    '</div>' +
    '<div class="cf-block cf-owner">' +
    '<div class="cf-head"><span>Owner coins</span><button type="button" class="link-btn" data-owner-tx="all">All transactions →</button></div>' +
    barListHtml([
      ownerRow('Generated', Number(apiField(d, 'ownerTotalGenerated', 0)), 'purple', 'generated'),
      ownerRow('Recharged', ownerRecharged, 'up', 'recharge'),
      ownerRow('Redeemed', ownerRedeemed, 'warn', 'redeem'),
    ], { format: (n) => '$' + fmtCompact(n) }) +
    '</div>' +
    '<div class="cf-ratios">' +
    '<span' + tipAttr('Player redeemed ÷ player recharged') + '>Player redeem ratio <b>' + ratio(redeemed, recharged) + '</b></span>' +
    '<span' + tipAttr('Owner redeemed ÷ owner recharged') + '>Owner redeem ratio <b>' + ratio(ownerRedeemed, ownerRecharged) + '</b></span>' +
    '</div>');
}

/** Dots are buttons; past this many the chart shows the biggest bettors (and says so). */
const SCATTER_LIMIT = 400;

function renderPlayerScatter(d) {
  const allUsers = d.rtpByUser || [];
  if (!allUsers.length) {
    setHtml('playerScatter', emptyHtml('No player activity yet.'));
    return;
  }
  const users = allUsers.length > SCATTER_LIMIT
    ? sortRows(allUsers, (u) => Number(u.totalBet || 0), -1).slice(0, SCATTER_LIMIT)
    : allUsers;
  const maxSpins = Math.max(1, ...users.map((u) => Number(u.totalSpin || 0)));
  const points = users.map((u) => {
    const rtp = rowRtp(u);
    const canDrill = Number(u.totalSpin) > 0 && u.userId;
    return {
      x: Number(u.totalBet || 0),
      y: Number(u.totalWin || 0),
      size: Math.sqrt(Number(u.totalSpin || 0) / maxSpins),
      tone: rtpTone(rtp * 100),
      tip: u.username + ' · RTP ' + fmtRtp(rtp) + '\nBet $' + fmtMoney(u.totalBet) + ' · Win $' + fmtMoney(u.totalWin) +
        '\n' + fmtInt(u.totalSpin) + ' spins' + (canDrill ? ' · click for sessions' : ''),
      attrs: canDrill ? ' data-drill="user" data-id="' + escAttr(u.userId) + '"' : '',
    };
  });
  setHtml('playerScatter',
    scatterHtml(points) +
    '<div class="chart-legend chart-legend-foot">' +
    '<span class="tone-up"><i></i>RTP ≥ 100%</span><span class="tone-warn"><i></i>80–99%</span><span class="tone-down"><i></i>&lt; 80%</span>' +
    '<button type="button" class="link-btn chart-note-link" data-explore="users-bet">' +
    (users.length < allUsers.length ? 'Top ' + users.length + ' of ' + fmtInt(allUsers.length) + ' by bet' : countLabel(users.length, 'player')) +
    ' · table →</button></div>');
}

function renderOnlinePanel(d, response) {
  const payload = totalGameUsersPayload(d);
  const count = gameUsersCount(payload);
  const totalUsers = Number(apiField(d, 'totalUsers', 0));
  const byGame = new Map();
  for (const u of gameUsersList(payload)) {
    const name = u.gameName || 'No active game';
    byGame.set(name, (byGame.get(name) || 0) + 1);
  }
  const items = [...byGame].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([label, value]) => ({ label, value, tone: label === 'No active game' ? 'flat' : 'info' }));
  const spark = response === currentLatestResponse() && liveSamples.length >= 2
    ? '<div class="online-spark"' + tipAttr('Online players over the last ' + liveSampleSpan()) + '>' +
      sparklineHtml(liveSamples.map((s) => s.online), 'info') + '</div>'
    : '<p class="chart-note">Trend appears after a few refreshes.</p>';

  setHtml('onlineChart',
    '<div class="online-head"><strong>' + fmtInt(count) + '</strong><span>players in game' +
    (totalUsers ? '<br>' + ((count / totalUsers) * 100).toFixed(1) + '% of ' + fmtInt(totalUsers) + ' registered' : '') + '</span></div>' +
    spark +
    (items.length ? barListHtml(items) : emptyHtml('Nobody is in a game right now.')));
}

function starsHtml(avg) {
  const full = Math.round(avg);
  return '<span class="stars" aria-label="' + avg.toFixed(1) + ' of 5 stars">' + '★'.repeat(full) + '<i>' + '★'.repeat(5 - full) + '</i></span>';
}

function renderFeedbackPanel(d) {
  const entries = allFeedbackEntries(d);
  const ratings = entries.map((f) => Number(f.ratingStar)).filter((n) => n >= 1 && n <= 5);
  if (!ratings.length) {
    setHtml('feedbackChart', emptyHtml('No ratings yet.'));
    return;
  }
  const avg = average(ratings);
  const starTone = { 5: 'up', 4: 'up', 3: 'warn', 2: 'down', 1: 'down' };
  const items = [5, 4, 3, 2, 1].map((star) => {
    const n = ratings.filter((r) => Math.round(r) === star).length;
    return { label: star + ' ★', value: n, tone: starTone[star], valueText: n + ' <small>' + ((n / ratings.length) * 100).toFixed(0) + '%</small>' };
  });
  const latest = entries
    .filter((f) => feedbackText(f) && parseUtc(f.createdAt))
    .sort((a, b) => parseUtc(b.createdAt) - parseUtc(a.createdAt))[0];

  setHtml('feedbackChart',
    '<div class="fb-head"><strong>' + avg.toFixed(1) + '</strong>' + starsHtml(avg) +
    '<small>' + countLabel(ratings.length, 'rating') + ' · ' + countLabel((d.userFeedbacks || []).length, 'player') + '</small></div>' +
    barListHtml(items, { max: ratings.length }) +
    (latest
      ? '<blockquote class="fb-latest">“' + escHtml(feedbackText(latest)) + '”<cite>' + escHtml(latest.username || 'Player') +
        ' · ' + escHtml(formatDateTime(latest.createdAt)) + '</cite></blockquote>'
      : ''));
}

function renderAnalytics(d, response) {
  renderInsights(d);
  renderGamePerformance(d);
  renderCashflow(d);
  renderPlayerScatter(d);
  renderOnlinePanel(d, response);
  renderFeedbackPanel(d);
}

/** After a "no changes" check only the live trends moved; redraw just those widgets. */
function refreshLiveWidgets() {
  if (historyViewIndex !== 0 || getActiveView() !== 'home') return;
  const response = currentSummaryResponse();
  if (!response) return;
  const d = response.data || {};
  setHtml('kpiGrid', buildKpiCards(d, responseHistory[1]?.response?.data, response).map(renderKpiCard).join(''));
  renderOnlinePanel(d, response);
}

// ---- Data explorer tabs ----

const HOME_TABLE_WRAP_IDS = ['rtpByGameWrap', 'rtpByUserWrap', 'gamesAboveTargetWrap', 'usersRtpHighWrap', 'userFeedbacksWrap', 'gamesTargetRtpWrap'];
const ANALYTICS_IDS = ['gamePerfChart', 'cashflowChart', 'playerScatter', 'onlineChart', 'feedbackChart'];

let activeExplorerTab = 'sec-rtp-game';

/** Placeholder KPI cards, charts and tables while the first summary is loading. */
function renderDashboardSkeleton() {
  const card = '<div class="kpi is-skeleton"><span class="sk-line"></span><span class="sk-line"></span><span class="sk-line"></span></div>';
  setHtml('kpiGrid', card.repeat(6));
  setHtml('insightsBar', '');
  ANALYTICS_IDS.forEach((id) => setHtml(id, skeletonHtml(4)));
  HOME_TABLE_WRAP_IDS.forEach((id) => setHtml(id, skeletonHtml(6)));
  show($('dashboard'), true);
  setDashboardViewMode();
}

function updateSectionNavCount(sectionId, count) {
  const countEl = $('sectionNav')?.querySelector('[data-tab="' + sectionId + '"] .section-nav-count');
  if (countEl && countEl.textContent !== String(count)) {
    countEl.textContent = String(count);
    if (sectionId === activeExplorerTab) placeExplorerTabIndicator(true);
  }
}

function renderSectionNav(sections) {
  setHtml('sectionNav', sections.map((s) =>
    '<button type="button" class="tab" role="tab" data-tab="' + s.id + '"' + (s.tone ? ' data-tone="' + s.tone + '"' : '') + '>' +
    '<span>' + s.label + '</span><span class="section-nav-count">0</span></button>'
  ).join(''));
  syncExplorerTabs();
}

function syncExplorerTabs({ animate = false } = {}) {
  document.querySelectorAll('#sectionNav [data-tab]').forEach((btn) => {
    const on = btn.dataset.tab === activeExplorerTab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.explorer-panel').forEach((panel) => show(panel, panel.id === activeExplorerTab));
  placeExplorerTabIndicator(animate);
}

/** Slides the explorer underline to the active tab. The first placement, and any rebuild, does not animate. */
function placeExplorerTabIndicator(animate) {
  const nav = $('sectionNav');
  const active = nav?.querySelector('.tab.is-active');
  if (!nav || !active) return;

  let indicator = nav.querySelector('.tab-indicator');
  const created = !indicator;
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'tab-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    nav.appendChild(indicator);
  }

  const inset = 8;
  const left = active.offsetLeft + inset;
  const width = Math.max(12, active.offsetWidth - inset * 2);
  if (created || !animate) indicator.style.transition = 'none';
  indicator.style.width = width + 'px';
  indicator.style.transform = 'translate3d(' + left + 'px, 0, 0)';
  if (created || !animate) {
    indicator.getBoundingClientRect();
    indicator.style.transition = '';
  }
}

function isExplorerSectionActive(sectionId) {
  return sectionId === activeExplorerTab;
}

/** Hidden tabs only keep their counts current; the table itself is built when the tab is shown. */
function setExplorerTab(sectionId, { scroll = false } = {}) {
  if (!$(sectionId)) return;
  activeExplorerTab = sectionId;
  syncExplorerTabs({ animate: true });
  EXPLORER_RENDERERS[sectionId]?.();
  if (scroll) $('dataExplorer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Named explorer views used by KPI actions and attention alerts: which tab, which filters (select
 * id → value; every other filter / search of that tab is reset) and which column to sort by.
 */
const EXPLORER_PRESETS = {
  'games-bet': { tab: 'sec-rtp-game', sort: 'Total Bet' },
  'games-hold': { tab: 'sec-rtp-game', sort: 'Hold' },
  'games-hold-loss': { tab: 'sec-rtp-game', sort: 'Hold', dir: 1 },
  'games-rtp': { tab: 'sec-rtp-game', sort: 'RTP' },
  'games-above': { tab: 'sec-rtp-game', sort: 'vs Target', filters: { rtpByGameStatusFilter: 'above' } },
  'games-below': { tab: 'sec-rtp-game', sort: 'vs Target', dir: 1, filters: { rtpByGameStatusFilter: 'below' } },
  'users-bet': { tab: 'sec-rtp-user', sort: 'Total Bet' },
  'users-high': { tab: 'sec-users-high', sort: 'RTP' },
  'feedback-low': {
    tab: 'sec-feedbacks',
    sort: 'Date',
    feedback: () => ({ from: shiftDayKey(-(LOW_RATING_ALERT_DAYS - 1)), to: toDateInputValue(), star: 'low' }),
  },
};

/** Explorer tab id → table wrap id (the explore view key) and the inputs it owns. */
function explorerSectionInputs(tab) {
  const table = Object.values(rtpTables).find((t) => t.sectionId === tab);
  if (table) return { wrapId: table.wrapId, selects: [table.filterId, table.statusFilterId].filter(Boolean), searchId: table.searchId };
  if (tab === 'sec-target-rtp') return { wrapId: 'gamesTargetRtpWrap', selects: GAME_TARGET_FILTER_IDS, searchId: '' };
  if (tab === 'sec-feedbacks') return { wrapId: 'userFeedbacksWrap', selects: [], searchId: '' };
  return null;
}

/** Open a preset (name or object): reset that tab's filters, apply the preset, sort, show and scroll. */
function openExplorer(presetOrName) {
  const preset = typeof presetOrName === 'string' ? EXPLORER_PRESETS[presetOrName] : presetOrName;
  const inputs = preset && explorerSectionInputs(preset.tab);
  if (!inputs) return;
  if (drillStack.length || getActiveView() !== 'home') goHome();
  if (inputs.searchId) setInputValue(inputs.searchId, '');
  inputs.selects.forEach((id) => setInputValue(id, preset.filters?.[id] ?? 'all'));
  if (preset.sort) setExploreSort(inputs.wrapId, preset.sort, preset.dir ?? -1);
  if (preset.feedback) setFeedbackFilter(preset.feedback());
  setExplorerTab(preset.tab, { scroll: true });
}

function openExplorerFromButton(button) {
  const name = button.dataset.explore;
  openExplorer(name === 'game-perf' ? gamePerfExplorerPreset() : name);
}

function renderDashboard(response) {
  const d = response?.data || {};
  currentDashboardData = d;
  setAboveTargetGames(d.gamesAboveTargetRtp);
  const historyIndex = responseHistory.findIndex((e) => e.response === response);
  const prev = historyIndex >= 0 ? responseHistory[historyIndex + 1]?.response?.data : null;

  setHtml('kpiGrid', buildKpiCards(d, prev, response).map(renderKpiCard).join(''));

  rtpTables.rtpByGame.rows = d.rtpByGame || [];
  rtpTables.gamesAboveTarget.rows = d.gamesAboveTargetRtp || [];
  rtpTables.rtpByUser.rows = d.rtpByUser || [];
  rtpTables.usersRtpHigh.rows = d.usersRtpAboveOrEqualOne || [];
  gamesTargetRtpData = (d.gamesTargetRtp || d.GamesTargetRtp || []).map(normalizeGameTargetRtpRow);

  populateTargetRtpSelect('rtpByGameTargetFilter', rtpTables.rtpByGame.rows);
  populateTargetRtpSelect('gamesAboveTargetFilter', rtpTables.gamesAboveTarget.rows);
  populateTargetRtpSelect('targetRtpFilter', gamesTargetRtpData);
  populateGameTitleFilter(gamesTargetRtpData);
  populateGameLiveFilter(gamesTargetRtpData);

  renderAnalytics(d, response);

  renderSectionNav([
    { id: 'sec-rtp-game', label: 'RTP by Game' },
    { id: 'sec-rtp-user', label: 'RTP by User' },
    { id: 'sec-above-target', label: 'Above Target', tone: 'warn' },
    { id: 'sec-users-high', label: 'Users RTP ≥100%', tone: 'down' },
    { id: 'sec-feedbacks', label: 'Feedback', tone: 'gold' },
    { id: 'sec-target-rtp', label: 'Game Catalog' },
    { id: 'sec-spin-wheel', label: 'Spin Wheel' },
    { id: 'sec-daily-rewards', label: 'Daily Rewards' },
  ]);
  syncRewardRecordNavCounts();
  if (REWARD_RECORD_TABS[activeExplorerTab] && rewardRecordState[activeExplorerTab]?.loaded) {
    showRewardRecords(activeExplorerTab);
  }
  // Each table render also updates its tab count.
  renderAllRtpTables();
  setUserFeedbacksData(d.userFeedbacks || []);

  // Raw JSON is large; only stringify it when the JSON card is open.
  if (!$('jsonCard').classList.contains('hidden')) renderJsonCard();
  show($('dashboard'), true);
}

function renderJsonCard() {
  const response = currentSummaryResponse();
  $('jsonView').textContent = response ? JSON.stringify(response, null, 2) : '';
}

// ---- Page switching ----

// Page switching: home dashboard, diff, drill-down, maintenance, user game play.

/** Which page is visible. Drill-down wins over diff, which wins over the secondary pages. */
function getActiveView() {
  if (drillStack.length > 0) return 'drill';
  if (isDiffVisible && !isDemoMode() && responseHistory.length >= 2) return 'diff';
  if (isMaintenanceVisible) return 'maintenance';
  if (isUserGameplayVisible) return 'user-gameplay';
  return 'home';
}

function hideJsonCard() {
  show($('jsonCard'), false);
  setText('toggleJsonBtn', 'Show JSON');
}

function toggleJsonCard() {
  if (getActiveView() !== 'home') return;
  const visible = !$('jsonCard').classList.contains('hidden');
  if (!visible) renderJsonCard();
  show($('jsonCard'), !visible);
  setText('toggleJsonBtn', visible ? 'Show JSON' : 'Hide JSON');
  updateControlsHighlight();
  if (!visible) $('jsonCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Leave drill-downs and every secondary page; callers then switch on the page they want. */
function resetToBaseView() {
  drillStack = [];
  activeChartSpins = [];
  resetSpinChartZoom(0, false);
  hideSpinChartTooltip();
  isDiffVisible = false;
  isMaintenanceVisible = false;
  isUserGameplayVisible = false;
}

function goHome() {
  resetToBaseView();
  hideJsonCard();
  setError('');
  const response = currentSummaryResponse();
  if (response) renderDashboard(response);
  updateDiffPanel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openMaintenancePage() {
  resetToBaseView();
  isMaintenanceVisible = true;
  setDashboardViewMode();
  loadMaintenanceSettings();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openUserGameplayPage() {
  resetToBaseView();
  isUserGameplayVisible = true;
  setDashboardViewMode();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setUserGameplayTab(userGameplayActiveTab || 'summary');
}

/** Expose the sticky header height as --app-header-sticky-height for sticky sub-headers. */
function syncStickyHeaderOffset() {
  const headerEl = document.querySelector('.app-header');
  const sticky = headerEl && getComputedStyle(headerEl).position === 'sticky';
  const height = sticky ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--app-header-sticky-height', height + 'px');
}

function setDashboardViewMode() {
  const view = getActiveView();
  // Secondary pages work without a summary; the Overview needs data (or the loading skeleton).
  show($('dashboard'), (view !== 'home' && view !== 'diff') || isSummaryLoading || !!currentSummaryResponse());
  show($('mainDashboard'), view === 'home');
  show($('diffCard'), view === 'diff');
  show($('drillDownCard'), view === 'drill');
  show($('maintenanceCard'), view === 'maintenance');
  show($('userGameplayCard'), view === 'user-gameplay');
  if (view !== 'drill' || currentDrillFrame()?.type !== 'owner-transactions') {
    show($('drillOwnerTxToolbar'), false);
  }
  if (view !== 'home') hideJsonCard();
  updateControlsHighlight();
}

function updateControlsHighlight() {
  const view = getActiveView();
  const jsonVisible = !$('jsonCard')?.classList.contains('hidden');

  const setActive = (id, active) => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('is-active', !!active);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  };

  // Drill-downs and diff belong to the Overview page.
  setActive('homeBtn', view === 'home' || view === 'drill' || view === 'diff');
  setActive('toggleDiffBtn', view === 'diff');
  setActive('toggleJsonBtn', jsonVisible && view === 'home');
  setActive('maintenanceBtn', view === 'maintenance');
  setActive('userGameplayBtn', view === 'user-gameplay');
  setActive('pauseRefreshBtn', isRefreshPaused && !isDemoMode());
}
