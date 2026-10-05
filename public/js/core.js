// Shared helpers loaded first: DOM, formatting, API access, UI widgets and view state.

// ---- DOM ----

const $ = (id) => document.getElementById(id);

function show(el, visible) {
  if (el) el.classList.toggle('hidden', !visible);
}

function setInputValue(id, value) {
  const el = $(id);
  if (el) el.value = value;
}

function setText(id, text) {
  const el = $(id);
  if (el && el.textContent !== text) el.textContent = text;
}

/**
 * Replace an element's HTML only when it changed (keeps scroll position and avoids re-layout
 * on auto-refresh). Every write to a rendered container should go through here.
 */
function setHtml(target, html) {
  const el = typeof target === 'string' ? $(target) : target;
  if (!el || el._html === html) return false;
  el._html = html;
  el.innerHTML = html;
  return true;
}

// ---- Formatting ----

/** Number(n), or 0 for null / undefined / NaN / non-numeric strings. */
function finiteNumber(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num : 0;
}

/** Amount for display: floating-point noise below half a cent shows as 0.00, never "-0.00". */
function moneyValue(n) {
  const num = finiteNumber(n);
  return Math.abs(num) < 0.005 ? 0 : num;
}

function fmtMoney(n) {
  return moneyValue(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Compact money for chart axes: 950, 1.2K, 3.4M. */
function fmtCompact(n) {
  return moneyValue(n).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
}

/** RTP as a 0–1 ratio (1 = 100%, can exceed 1). */
function fmtRtp(n) {
  return (finiteNumber(n) * 100).toFixed(2) + '%';
}

/** RTP already expressed as a percent (stored procedures return e.g. 104.05). */
function fmtRtpPercent(n) {
  return finiteNumber(n).toFixed(2) + '%';
}

function fmtInt(n) {
  return finiteNumber(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return escHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** "1 row", "3 rows" (no number formatting). */
function countLabel(n, noun) {
  return n + ' ' + noun + (n === 1 ? '' : 's');
}

function sumBy(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

function average(numbers) {
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/** Case-insensitive "contains" match against a list of searchable strings. */
function matchesAnyText(candidates, query) {
  return candidates.some((c) => String(c).toLowerCase().includes(query));
}

// ---- Tones (one color system for text, badges and stat cards; see .tone-* in base.css) ----

/** RTP percent tone: ≥100 green, ≥80 orange, else red. */
function rtpTone(pct) {
  const n = Number(pct || 0);
  if (n >= 100) return 'up';
  if (n >= 80) return 'warn';
  return 'down';
}

/** Win compared with bet: green when ahead, red when behind. */
function winTone(bet, win) {
  const b = Number(bet || 0);
  const w = Number(win || 0);
  if (w > b) return 'up';
  if (w < b) return 'down';
  return 'flat';
}

function valHtml(html, tone) {
  return '<span class="val' + (tone ? ' tone-' + tone : '') + '">' + html + '</span>';
}

function moneyHtml(amount, tone) {
  return valHtml('$' + fmtMoney(amount), tone);
}

function badgeHtml(text, tone = 'flat') {
  return '<span class="badge tone-' + tone + '">' + escHtml(text) + '</span>';
}

/** Stat card: label + value, optional tone and extra HTML below the value. */
function statHtml(label, valueHtml, tone = '', extraHtml = '') {
  return '<div class="stat' + (tone ? ' tone-' + tone : '') + '"><span>' + escHtml(label) + '</span><strong>' +
    valueHtml + '</strong>' + extraHtml + '</div>';
}

// ---- API ----

// Production API host (never the Cloudflare workers.dev URL).
const LIVE_API_ORIGIN = 'https://gamevault222.com';
const INTERNAL_API = '/api/dashboard/internal';

function isLocalDevHost() {
  const host = (location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
}

/** Demo (sample) data is a local development aid only; hosted dashboards always use the API. */
function isDemoMode() {
  return isLocalDevHost() && $('dataSource')?.value === 'demo';
}

function apiOrigin() {
  // Local: same origin → server.py proxy → localhost:5036. Any hosted URL: the live API.
  if (isLocalDevHost()) return window.location.origin;
  return LIVE_API_ORIGIN;
}

function apiUrl(path) {
  return apiOrigin().replace(/\/$/, '') + path;
}

/** Read a payload field that may arrive camelCase or PascalCase. */
function apiField(obj, key, fallback) {
  const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
  return obj?.[key] ?? obj?.[pascalKey] ?? fallback;
}

function isStaticServer404(text) {
  return /Error code:\s*404/i.test(text) && /File not found/i.test(text);
}

/** Parse the `{ success, message, data }` envelope; throws on HTTP or API failure. */
function parseApiResponse(res, text) {
  let json;
  try { json = text ? JSON.parse(text) : null; } catch {
    if (isStaticServer404(text)) {
      throw new Error('STATIC_404');
    }
    throw new Error('Response is not valid JSON.\n' + text.slice(0, 300));
  }
  if (!res.ok) throw new Error(json?.message || json?.title || ('HTTP ' + res.status));
  if (!json?.success) throw new Error(json?.message || 'API returned success: false');
  return json;
}

/** A request that hangs longer than this fails, so refresh / retry and the loading guards recover. */
const API_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url, options = {}) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  } catch (err) {
    if (err?.name === 'TimeoutError') throw new Error('Request timed out after ' + API_TIMEOUT_MS / 1000 + 's.');
    throw err;
  }
}

/**
 * GET an internal API endpoint and return the parsed envelope.
 * `noCache` adds Cache-Control: no-cache and bypasses the browser cache.
 */
async function fetchApiJson(path, { noCache = true } = {}) {
  const options = noCache
    ? { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' }
    : { headers: { Accept: 'application/json' } };
  const res = await fetchWithTimeout(apiUrl(INTERNAL_API + path), options);
  const text = await res.text();
  return parseApiResponse(res, text);
}

// ---- UI widgets ----

const EMPTY_CELL_HTML = '<span class="cell-empty">—</span>';

let toastTimer = null;

/** `state`: ok | busy | paused | err | idle. Called every second, so unchanged values are not rewritten. */
function setConnectionStatus(state, text) {
  const pill = $('statusPill');
  const s = state || 'idle';
  if (pill && pill.dataset.state !== s) pill.dataset.state = s;
  const dot = $('connDot');
  if (dot.className !== 'dot ' + s) dot.className = 'dot ' + s;
  setText('connText', text);
}

function setError(message) {
  const el = $('fetchError');
  if (!message) { show(el, false); return; }
  setText('fetchErrorText', message);
  show(el, true);
}

/** `tone`: ok | info | err. */
function showToast(message, tone = 'ok') {
  const toast = $('loadToast');
  toast.textContent = message;
  toast.dataset.tone = tone;
  show(toast, true);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => show(toast, false), 200);
  }, 3000);
}

function setRowCount(id, rows) {
  setText(id, countLabel(Array.isArray(rows) ? rows.length : 0, 'row'));
}

/** Number of pages for `total` rows (at least 1). */
function pageCount(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize) || 1);
}

const EMPTY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13l2.5-7h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1.5 2h5l1.5-2h5"/></svg>';
const ERROR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>';

/** Empty / no-results state with an optional hint line. */
function emptyHtml(message = 'No data.', { hint = '', tone = '' } = {}) {
  const isError = tone === 'err';
  return '<div class="empty' + (isError ? ' is-error' : '') + '"' + (isError ? ' role="alert"' : '') + '>' +
    (isError ? ERROR_ICON : EMPTY_ICON) +
    '<strong>' + escHtml(message) + '</strong>' +
    (hint ? '<span>' + escHtml(hint) + '</span>' : '') +
    '</div>';
}

function errorHtml(message, hint = 'Check the connection, then try again.') {
  return emptyHtml(message, { hint, tone: 'err' });
}

/** Placeholder rows shown while a table or panel is loading. */
function skeletonHtml(rows = 6) {
  return '<div class="skeleton" aria-busy="true" aria-label="Loading">' +
    '<span class="sk-line sk-head"></span>' +
    '<span class="sk-line"></span>'.repeat(rows) +
    '</div>';
}

/**
 * Render `rows` as a table into `containerId` (skipped when the markup is unchanged).
 * Column: `{ label, key }` (escaped value) or `{ label, render(row) }` (raw HTML),
 * plus optional `align: 'right' | 'center'`, `width` and `className`.
 */
function renderTable(containerId, rows, columns, emptyMessage = 'No data.', options = {}) {
  const view = options.explore ? exploreView(containerId, columns, options) : null;
  if (!view) clearTablePager(containerId);
  if (!Array.isArray(rows) || rows.length === 0) {
    setHtml(containerId, emptyHtml(emptyMessage));
    if (view) setHtml(tablePagerEl(containerId), '');
    return;
  }
  const pageRows = view ? exploreRows(view, rows) : rows;

  const cellClass = columns.map((c) => {
    const cls = [c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : '', c.className || '']
      .filter(Boolean).join(' ');
    return cls ? ' class="' + cls + '"' : '';
  });
  const head = '<tr>' + columns.map((c, i) => {
    const style = c.width ? ' style="width:' + escAttr(c.width) + '"' : '';
    if (!view || !c.sort) return '<th' + cellClass[i] + style + '>' + c.label + '</th>';
    const active = view.sortLabel === c.label;
    return '<th' + cellClass[i] + style + ' aria-sort="' + (active ? (view.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
      '<button type="button" class="th-sort' + (active ? ' is-active' : '') + '" data-sort-col="' + i + '" data-sort-for="' + escAttr(containerId) + '">' +
      c.label + '<i aria-hidden="true">' + (active ? (view.dir > 0 ? '▲' : '▼') : '↕') + '</i></button></th>';
  }).join('') + '</tr>';
  const body = pageRows.map((row, rowIndex) => {
    const rowClass = options.getRowClass ? options.getRowClass(row) : '';
    return (rowClass ? '<tr class="' + escAttr(rowClass) + '">' : '<tr>') +
      columns.map((c, i) =>
        '<td' + cellClass[i] + '>' + (c.render ? c.render(row, rowIndex) : escHtml(row[c.key] ?? '')) + '</td>'
      ).join('') +
      '</tr>';
  }).join('');

  setHtml(containerId, '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>');
  if (view) renderTablePager(containerId, view, rows.length);
}

// ---- Explorer tables: sortable headers + client-side pages ----
// renderTable(..., { explore: key, rerender, resetKey }) keeps sort / page per `key`. Columns opt in
// with `sort: (row) => value` (and optional `sortDir: 1 | -1` for the first click).
// Changing `resetKey` (e.g. the filter values) returns to page 1; data refreshes keep the page.

const TABLE_PAGE_SIZE = 50;
const exploreViews = new Map();
const exploreViewByContainer = new Map();

function exploreViewFor(key) {
  if (!exploreViews.has(key)) {
    exploreViews.set(key, { key, sortLabel: '', dir: -1, page: 1, resetKey: '', columns: [], rerender: null, pageSize: TABLE_PAGE_SIZE, total: 0 });
  }
  return exploreViews.get(key);
}

function exploreView(containerId, columns, options) {
  const view = exploreViewFor(options.explore);
  view.columns = columns;
  view.pageSize = options.pageSize || TABLE_PAGE_SIZE;
  if (options.rerender) view.rerender = options.rerender;
  const resetKey = String(options.resetKey ?? '');
  if (resetKey !== view.resetKey) {
    view.resetKey = resetKey;
    view.page = 1;
  }
  exploreViewByContainer.set(containerId, view);
  return view;
}

/** Stable sort; strings compare naturally ("Game 2" < "Game 10"), everything else numerically. */
function sortRows(rows, getValue, dir) {
  return rows
    .map((row, i) => ({ row, i, v: getValue(row) }))
    .sort((a, b) => {
      const cmp = typeof a.v === 'string' || typeof b.v === 'string'
        ? String(a.v ?? '').localeCompare(String(b.v ?? ''), undefined, { numeric: true, sensitivity: 'base' })
        : (Number(a.v) || 0) - (Number(b.v) || 0);
      return cmp * dir || a.i - b.i;
    })
    .map((e) => e.row);
}

function exploreRows(view, rows) {
  const col = view.columns.find((c) => c.sort && c.label === view.sortLabel);
  const sorted = col ? sortRows(rows, col.sort, view.dir) : rows;
  view.total = sorted.length;
  view.page = Math.min(Math.max(1, view.page), pageCount(sorted.length, view.pageSize));
  const start = (view.page - 1) * view.pageSize;
  return sorted.length > view.pageSize ? sorted.slice(start, start + view.pageSize) : sorted;
}

/** Pager bar right after the table wrap (created on first use, hidden when everything fits). */
function tablePagerEl(containerId) {
  const wrap = $(containerId);
  let el = wrap.nextElementSibling;
  if (!el || el.dataset.pagerFor !== containerId) {
    el = document.createElement('div');
    el.className = 'pager-bar table-pager';
    el.dataset.pagerFor = containerId;
    wrap.after(el);
  }
  return el;
}

/** For containers that also show non-explore content (drill-down levels, skeletons). */
function clearTablePager(containerId) {
  const next = $(containerId)?.nextElementSibling;
  if (next?.dataset.pagerFor === containerId) setHtml(next, '');
}

function renderTablePager(containerId, view, total) {
  setHtml(tablePagerEl(containerId), total <= view.pageSize ? '' : renderPagerHtml({
    dataAttr: 'data-table-page',
    page: view.page,
    pageSize: view.pageSize,
    total,
    totalPages: pageCount(total, view.pageSize),
  }));
}

/** Programmatic sort (presets, "View all"); applied on the next render of that view. */
function setExploreSort(key, label, dir = -1) {
  const view = exploreViewFor(key);
  view.sortLabel = label;
  view.dir = dir;
  view.page = 1;
}

function handleExploreTableClick(e) {
  const sortBtn = e.target.closest('[data-sort-col]');
  if (sortBtn) {
    const view = exploreViewByContainer.get(sortBtn.dataset.sortFor);
    const col = view?.columns[Number(sortBtn.dataset.sortCol)];
    if (!col) return true;
    if (view.sortLabel === col.label) view.dir = -view.dir;
    else {
      view.sortLabel = col.label;
      view.dir = col.sortDir || (col.align === 'right' ? -1 : 1);
    }
    view.page = 1;
    view.rerender?.();
    return true;
  }
  const pageBtn = e.target.closest('[data-table-page]');
  if (pageBtn) {
    const containerId = pageBtn.closest('[data-pager-for]')?.dataset.pagerFor;
    const view = exploreViewByContainer.get(containerId);
    if (!view || pageBtn.disabled) return true;
    const last = pageCount(view.total, view.pageSize);
    const targets = { first: 1, prev: view.page - 1, next: view.page + 1, last };
    view.page = Math.min(last, Math.max(1, targets[pageBtn.dataset.tablePage] ?? view.page));
    view.rerender?.();
    $(containerId).scrollTop = 0;
    return true;
  }
  return false;
}

function ratingBadge(rating) {
  const r = Number(rating || 0);
  const tone = r <= 2 ? 'down' : r >= 4 ? 'up' : 'warn';
  return badgeHtml(r.toFixed(1) + ' / 5', tone);
}

// ---- RTP / hold math (one definition for every page) ----
// Same formulas as the API (InternalDashboardService.ComputeRtp): RTP = win ÷ bet as a ratio, 0 when nothing was bet.

function rtpRatio(bet, win) {
  const b = finiteNumber(bet);
  return b ? finiteNumber(win) / b : 0;
}

function rowRtp(r) {
  return rtpRatio(r?.totalBet, r?.totalWin);
}

/** Bet − win: what the house kept (negative when players won more than they bet), in whole cents. */
function rowHold(r) {
  return Math.round((finiteNumber(r?.totalBet) - finiteNumber(r?.totalWin)) * 100) / 100;
}

/** RTP minus target RTP, in percentage points. */
function rtpVsTarget(r) {
  return (rowRtp(r) - finiteNumber(r?.targetRtp)) * 100;
}

/** "+1.2 pp" / "−0.4 pp"; values that round to zero show as "0.0 pp". */
function fmtPp(pp) {
  const rounded = Math.round(pp * 10) / 10;
  return (rounded > 0 ? '+' : rounded < 0 ? '−' : '') + Math.abs(rounded).toFixed(1) + ' pp';
}

/**
 * "Above target" comes from the API's gamesAboveTargetRtp list (server rule: bet > 0 and RTP > target),
 * so the KPI, alerts, filters, game panel and Above Target tab always agree with it.
 */
let aboveTargetGameIds = new Set();
let aboveTargetGameNames = new Set();

function setAboveTargetGames(list) {
  aboveTargetGameIds = new Set();
  aboveTargetGameNames = new Set();
  for (const g of list || []) {
    if (g.gameId) aboveTargetGameIds.add(String(g.gameId));
    else if (g.gameName) aboveTargetGameNames.add(String(g.gameName));
  }
}

function isAboveTarget(r) {
  return (!!r?.gameId && aboveTargetGameIds.has(String(r.gameId))) || aboveTargetGameNames.has(String(r?.gameName || ''));
}

/** `over` colours the bar as above target (games) or at/above break-even (players). */
function rtpBar(rtp, over = false) {
  const val = Number(rtp || 0);
  const pct = Math.min(val * 100, 100);
  return '<div class="rtp-bar-wrap"><span class="val">' + fmtRtp(val) + '</span>' +
    '<div class="rtp-bar' + (over ? ' over' : '') + '"><span style="width:' + pct + '%"></span></div></div>';
}

function graphIconButton(kind, id, enabled = true, label = 'View graph') {
  return '<button type="button" class="icon-btn graph-btn" data-drill="' + escAttr(kind) +
    '" data-id="' + escAttr(id) + '" data-tip="' + escAttr(enabled ? label : 'No session spin data') +
    '" aria-label="' + escAttr(label) + '"' + (enabled ? '' : ' disabled') + '>' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>' +
    '</button>';
}

/**
 * Pager markup: "Showing a–b of n" plus First/Prev/Next/Last buttons carrying `dataAttr`.
 * Pass `jumpInputId` to add a "Go to page" input.
 */
function renderPagerHtml({ dataAttr, page, pageSize, total, totalPages, jumpInputId = '' }) {
  const fromRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toRow = Math.min(page * pageSize, total);
  const button = (action, label, disabled, title) =>
    '<button type="button" class="secondary sm" ' + dataAttr + '="' + action + '"' +
    (title ? ' data-tip="' + title + '" aria-label="' + title + '"' : '') +
    (disabled ? ' disabled' : '') + '>' + label + '</button>';
  const jump = jumpInputId
    ? '<span class="pager-jump">' +
      '<label for="' + jumpInputId + '">Go to</label>' +
      '<input type="number" id="' + jumpInputId + '" min="1" max="' + totalPages + '" value="' + page + '" inputmode="numeric" />' +
      button('goto', 'Go', false) +
      '</span>'
    : '';
  return '<span class="pager-info">Showing <b>' + fmtInt(fromRow) + '–' + fmtInt(toRow) + '</b> of <b>' + fmtInt(total) + '</b></span>' +
    '<div class="pager-actions">' +
    button('first', '«', page <= 1, 'First page') +
    button('prev', '‹ Prev', page <= 1) +
    '<span class="pager-page">Page ' + fmtInt(page) + ' / ' + fmtInt(totalPages) + '</span>' +
    button('next', 'Next ›', page >= totalPages) +
    button('last', '»', page >= totalPages, 'Last page') +
    jump +
    '</div>';
}

// ---- Confirm dialog ----

let confirmHandler = null;

/** Yes/No dialog; `onConfirm` runs only when the user confirms. */
function openConfirm({ title, message, confirmLabel = 'Yes', danger = false, onConfirm }) {
  setText('confirmTitle', title);
  setText('confirmMessage', message);
  const yes = $('confirmYesBtn');
  yes.textContent = confirmLabel;
  yes.classList.toggle('danger', danger);
  confirmHandler = onConfirm;
  show($('confirmModal'), true);
  yes.focus();
}

function closeConfirm() {
  confirmHandler = null;
  show($('confirmModal'), false);
}

function isConfirmOpen() {
  return !$('confirmModal').classList.contains('hidden');
}

function bindConfirmEvents() {
  $('confirmYesBtn').addEventListener('click', () => {
    const handler = confirmHandler;
    closeConfirm();
    if (handler) handler();
  });
  $('confirmNoBtn').addEventListener('click', closeConfirm);
  $('confirmModal').addEventListener('click', (e) => {
    if (e.target === $('confirmModal')) closeConfirm();
  });
}

// ---- View state ----

// View state shared across features. Feature-specific state lives in each feature file.

/** `data` object of the summary response currently rendered on the dashboard. */
let currentDashboardData = null;

/** Drill-down frames (online users → sessions → spin graph, owner transactions, …). */
let drillStack = [];
let isDrillLoading = false;

let isDiffVisible = false;
let isMaintenanceVisible = false;
let isUserGameplayVisible = false;
function currentDrillFrame() {
  return drillStack[drillStack.length - 1];
}
