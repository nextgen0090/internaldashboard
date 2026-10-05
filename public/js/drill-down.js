// Drill-down views: online users, game users, sessions and owner transactions.

// ---- Users, sessions and spin graph frames ----

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

async function fetchUserSessions(userId, { noCache = false } = {}) {
  const json = await fetchApiJson('/users/' + encodeURIComponent(userId) + '/sessions', { noCache });
  return json.data?.sessions || [];
}

async function fetchGameUsers(gameId, { noCache = false } = {}) {
  const json = await fetchApiJson('/games/' + encodeURIComponent(gameId) + '/users', { noCache });
  return json.data?.users || [];
}

async function fetchSessionSpins(sessionId) {
  const json = await fetchApiJson('/sessions/' + encodeURIComponent(sessionId) + '/spins', { noCache: false });
  return json.data?.spinLogs || [];
}

function pushDrill(frame) {
  drillStack.push(frame);
  isDiffVisible = false;
  isMaintenanceVisible = false;
  isUserGameplayVisible = false;
  renderDrillView();
}

/** Pop drill frames until `depth` remain (0 returns to the Overview). */
function popDrillTo(depth) {
  if (isDrillLoading) return;
  drillStack.length = Math.max(0, Math.min(depth, drillStack.length));
  activeChartSpins = [];
  resetSpinChartZoom(0, false);
  hideSpinChartTooltip();
  if (drillStack.length) {
    renderDrillView();
  } else {
    const response = currentSummaryResponse();
    if (response) renderDashboard(response);
    setDashboardViewMode();
  }
}

function closeDrillFrame() {
  popDrillTo(drillStack.length - 1);
}

function drillFrameLabel(frame) {
  if (frame.type === 'online-users') return 'Online Users';
  if (frame.type === 'owner-transactions') return 'Owner Transactions';
  if (frame.type === 'game-users') return frame.game.gameName || 'Game';
  if (frame.type === 'sessions') return (frame.title || 'User') + ' · Sessions';
  return 'Spin graph';
}

/** "Overview › Online Users › player · Sessions › Spin graph"; earlier levels are clickable. */
function renderDrillBreadcrumb() {
  const crumbs = ['<button type="button" data-crumb="0">Overview</button>'];
  drillStack.forEach((frame, i) => {
    const label = escHtml(drillFrameLabel(frame));
    crumbs.push(i === drillStack.length - 1
      ? '<span class="crumb-current" aria-current="page">' + label + '</span>'
      : '<button type="button" data-crumb="' + (i + 1) + '">' + label + '</button>');
  });
  setHtml('drillBreadcrumb', crumbs.join('<span class="crumb-sep" aria-hidden="true">›</span>'));
}

function findSummaryRow(kind, id) {
  const rows = kind === 'game' ? currentDashboardData?.rtpByGame : currentDashboardData?.rtpByUser;
  const key = kind === 'game' ? 'gameId' : 'userId';
  return (rows || []).find((row) => String(row[key]) === String(id));
}

function setDrillHeader(title, meta) {
  setText('drillTitle', title);
  setText('drillMeta', meta);
}

function renderDrillView() {
  const frame = currentDrillFrame();
  setDashboardViewMode();
  if (!frame) return;

  renderDrillBreadcrumb();
  show($('drillTableWrap'), frame.type !== 'spins');
  show($('drillChartWrap'), frame.type === 'spins');
  show($('drillOwnerTxToolbar'), frame.type === 'owner-transactions');
  if (frame.type === 'spins') clearTablePager('drillTableWrap');
  syncDrillUpdateButton();

  if (frame.type === 'owner-transactions') renderOwnerTransactionsDrill(frame);
  else if (frame.type === 'online-users') renderOnlineUsersDrill(frame);
  else if (frame.type === 'game-users') renderGameUsersDrill(frame);
  else if (frame.type === 'sessions') renderSessionsDrill(frame);
  else renderSpinGraphDrill(frame);
}

const byText = (key) => (r) => String(r[key] || '');
const byNumber = (key) => (r) => Number(r[key] || 0);

const ONLINE_USER_COLUMNS = [
  {
    label: 'Username',
    sort: byText('username'),
    render: (r) => r.username ? '<span class="cell-user">' + escHtml(r.username) + '</span>' : EMPTY_CELL_HTML,
  },
  {
    label: 'Game',
    sort: byText('gameName'),
    render: (r) => r.gameName
      ? '<span class="cell-game">' + escHtml(r.gameName) + '</span>'
      : '<span class="cell-empty">No active game</span>',
  },
  {
    label: 'User ID',
    render: (r) => r.userId ? '<span class="cell-id user-id">' + escHtml(r.userId) + '</span>' : EMPTY_CELL_HTML,
  },
  {
    label: 'Game ID',
    render: (r) => r.gameId && String(r.gameId) !== EMPTY_GUID
      ? '<span class="cell-id game-id">' + escHtml(r.gameId) + '</span>'
      : EMPTY_CELL_HTML,
  },
  {
    label: 'Drill',
    align: 'center',
    className: 'col-action',
    render: (r) => graphIconButton('online-user', r.userId, !!r.userId, 'View user sessions'),
  },
];

const GAME_USER_COLUMNS = [
  { label: 'Username', sort: byText('username'), render: (r) => '<span class="cell-user">' + escHtml(r.username) + '</span>' },
  { label: 'Total Bet', align: 'right', sort: byNumber('totalBet'), render: (r) => moneyHtml(r.totalBet, 'bet') },
  { label: 'Total Win', align: 'right', sort: byNumber('totalWin'), render: (r) => moneyHtml(r.totalWin, winTone(r.totalBet, r.totalWin)) },
  { label: 'Hold', align: 'right', sort: rowHold, render: holdHtml },
  { label: 'Spins', align: 'right', sort: byNumber('totalSpin'), render: (r) => fmtInt(r.totalSpin) },
  { label: 'RTP', align: 'right', sort: rowRtp, render: (r) => rtpBar(rowRtp(r), rowRtp(r) >= 1) },
  {
    label: 'Drill',
    align: 'center',
    className: 'col-action',
    render: (r) => graphIconButton('game-user', r.userId, (r.sessions || []).length > 0, 'View user sessions'),
  },
];

const SESSION_COLUMNS = [
  { label: 'Started', sort: (r) => utcMillis(r.startedAt) || 0, sortDir: -1, render: (r) => '<span class="cell-date">' + escHtml(formatDateTime(r.startedAt)) + '</span>' },
  { label: 'Game', sort: byText('gameName'), render: (r) => '<span class="cell-game">' + escHtml(r.gameName) + '</span>' },
  { label: 'Username', render: (r) => '<span class="cell-user">' + escHtml(r.username) + '</span>' },
  { label: 'Total Bet', align: 'right', sort: byNumber('totalBet'), render: (r) => moneyHtml(r.totalBet, 'bet') },
  { label: 'Total Win', align: 'right', sort: byNumber('totalWin'), render: (r) => moneyHtml(r.totalWin, winTone(r.totalBet, r.totalWin)) },
  { label: 'Spins', align: 'right', sort: byNumber('totalSpin'), render: (r) => fmtInt(r.totalSpin) },
  { label: 'RTP', align: 'right', sort: rowRtp, render: (r) => valHtml(fmtRtp(rowRtp(r)), rtpTone(rowRtp(r) * 100)) },
  {
    label: 'Drill',
    align: 'center',
    className: 'col-action',
    render: (r) => graphIconButton('session', r.sessionId, Number(r.totalSpin) > 0, 'View session spin graph'),
  },
];

/** Sort / page state per drill level; a different game or user starts again at page 1. */
function drillExploreOptions(frame, key, resetKey) {
  return {
    explore: 'drill-' + key,
    rerender: renderDrillView,
    resetKey,
    getRowClass: (r) => newDrillRowClass(frame, r),
  };
}

function renderOnlineUsersDrill(frame) {
  const onlineCount = gameUsersCount(totalGameUsersPayload(currentDashboardData));
  setDrillHeader('Online Users', countLabel(onlineCount, 'user'));
  renderTable('drillTableWrap', frame.users || [], ONLINE_USER_COLUMNS, 'No users are online right now.',
    drillExploreOptions(frame, 'online', ''));
}

function renderGameUsersDrill(frame) {
  const users = frame.game.users || [];
  setDrillHeader(frame.game.gameName + ' · Users', countLabel(users.length, 'user'));
  renderTable('drillTableWrap', users, GAME_USER_COLUMNS, 'No players for this game.',
    drillExploreOptions(frame, 'game-users', frame.game.gameId));
}

function renderSessionsDrill(frame) {
  const sessions = frame.sessions || [];
  setDrillHeader(frame.title + ' · Sessions', countLabel(sessions.length, 'session'));
  renderTable('drillTableWrap', sessions, SESSION_COLUMNS, 'No sessions.',
    drillExploreOptions(frame, 'sessions', JSON.stringify(frame.source || frame.title)));
}

function renderSpinGraphDrill(frame) {
  const session = frame.session;
  const spins = session.spinLogs || [];
  const totalBet = sumBy(spins, 'betAmount');
  const totalWin = sumBy(spins, 'winAmount');
  const freeSpinCount = spins.filter(isSpinFree).length;
  const paidSpinCount = spins.length - freeSpinCount;
  setDrillHeader(
    session.username + ' · ' + session.gameName + ' · Spin Graph',
    countLabel(spins.length, 'spin') + ' · ' + freeSpinCount + ' free · ' + paidSpinCount + ' paid'
  );
  const bet = totalBet || session.totalBet;
  const win = totalWin || session.totalWin;
  const rtp = rtpRatio(bet, win);
  setHtml('chartSummary', [
    statHtml('Session Total Bet', '$' + fmtMoney(bet), 'bet'),
    statHtml('Session Total Win', '$' + fmtMoney(win), winTone(bet, win)),
    statHtml('Session RTP', fmtRtp(rtp), rtpTone(Number(rtp || 0) * 100)),
    statHtml('Spins', fmtInt(spins.length)),
    statHtml('Free Spins', fmtInt(freeSpinCount), 'purple'),
    statHtml('Paid Spins', fmtInt(paidSpinCount), 'info'),
    statHtml('Started', escHtml(formatDateTime(session.startedAt))),
  ].join(''));
  activeChartSpins = spins;
  resetSpinChartZoom(spins.length, false);
  syncSpinViewJsonButton();
  window.requestAnimationFrame(() => renderSpinChart(spins));
}

function openOnlineUsers() {
  pushDrill({
    type: 'online-users',
    users: gameUsersList(totalGameUsersPayload(currentDashboardData)),
  });
}

/** Keep open drill views in sync when summary data reloads (Load / auto-refresh). */
function refreshOpenDrillFromLatest() {
  if (!drillStack.length || !currentDashboardData) return;

  let changed = false;
  for (const frame of drillStack) {
    if (frame.type === 'online-users') {
      frame.users = gameUsersList(totalGameUsersPayload(currentDashboardData));
      changed = true;
    }
  }

  if (changed) renderDrillView();
}

// ---- Background updates for sessions / game users ----

let isDrillUpdateChecking = false;

function drillRowKey(frame) {
  return frame.type === 'game-users' ? 'userId' : 'sessionId';
}

function drillFrameRows(frame) {
  return (frame.type === 'game-users' ? frame.game.users : frame.sessions) || [];
}

function newDrillRowClass(frame, row) {
  return frame.newRowKeys?.has(String(row[drillRowKey(frame)])) ? 'row-new' : '';
}

/** Latest rows for a sessions / game-users frame, or null when the frame cannot be re-fetched. */
async function fetchDrillFrameRows(frame) {
  const fresh = { noCache: true };
  if (frame.type === 'game-users') return fetchGameUsers(frame.game.gameId, fresh);
  const source = frame.source;
  if (!source?.userId) return null;
  if (!source.gameId) return fetchUserSessions(source.userId, fresh);
  const users = await fetchGameUsers(source.gameId, fresh);
  const user = users.find((u) => String(u.userId) === String(source.userId));
  return user ? user.sessions || [] : null;
}

/**
 * Called after each summary refresh: re-fetch the open sessions / game-users list in the background
 * and, when it changed, offer it through the "New data" button instead of replacing the view.
 */
async function checkOpenDrillForUpdates() {
  const frame = currentDrillFrame();
  if (!frame || isDemoMode() || isDrillLoading || isDrillUpdateChecking) return;
  if (frame.type !== 'sessions' && frame.type !== 'game-users') return;

  isDrillUpdateChecking = true;
  try {
    const rows = await fetchDrillFrameRows(frame);
    if (rows && JSON.stringify(rows) !== JSON.stringify(drillFrameRows(frame))) {
      frame.pendingRows = rows;
      syncDrillUpdateButton();
    }
  } catch {
    // Keep showing the current rows; the next refresh tries again.
  } finally {
    isDrillUpdateChecking = false;
  }
}

function syncDrillUpdateButton() {
  const btn = $('drillUpdateBtn');
  const frame = currentDrillFrame();
  const pending = frame?.pendingRows;
  show(btn, !!pending);
  if (!pending) return;

  const key = drillRowKey(frame);
  const known = new Set(drillFrameRows(frame).map((r) => String(r[key])));
  const added = pending.filter((r) => !known.has(String(r[key]))).length;
  const noun = frame.type === 'game-users' ? 'new user' : 'new session';
  btn.textContent = added ? countLabel(added, noun) + ' · Show' : 'Data updated · Show';
}

/** Swap in the pending rows, keep the table scroll position and highlight rows that are new. */
function applyPendingDrillRows() {
  const frame = currentDrillFrame();
  if (!frame?.pendingRows) return;

  const key = drillRowKey(frame);
  const known = new Set(drillFrameRows(frame).map((r) => String(r[key])));
  frame.newRowKeys = new Set(frame.pendingRows.map((r) => String(r[key])).filter((k) => !known.has(k)));
  if (frame.type === 'game-users') frame.game = { ...frame.game, users: frame.pendingRows };
  else frame.sessions = frame.pendingRows;
  frame.pendingRows = null;

  const wrap = $('drillTableWrap');
  const scrollTop = wrap.scrollTop;
  renderDrillView();
  wrap.scrollTop = scrollTop;
  frame.newRowKeys = null;
}

/** Show the drill card in a loading state before the first frame is pushed. */
function showDrillLoading(title) {
  setDrillHeader(title, '');
  show($('mainDashboard'), false);
  show($('diffCard'), false);
  show($('drillDownCard'), true);
  show($('drillOwnerTxToolbar'), false);
  show($('drillChartWrap'), false);
  show($('drillUpdateBtn'), false);
  show($('drillTableWrap'), true);
  setHtml('drillTableWrap', skeletonHtml(8));
  clearTablePager('drillTableWrap');
  if (!drillStack.length) setHtml('drillBreadcrumb', '<button type="button" data-crumb="0">Overview</button>');
}

async function openUserSessions(userRow) {
  if (isDrillLoading || !userRow) return;
  isDrillLoading = true;
  setError('');
  showDrillLoading('Loading sessions for ' + (userRow.username || 'user') + '…');

  try {
    let sessions = userRow.sessions;
    if (!isDemoMode()) {
      sessions = await fetchUserSessions(userRow.userId);
    } else if (!Array.isArray(sessions)) {
      sessions = [];
    }
    pushDrill({ type: 'sessions', title: userRow.username, sessions, source: { userId: userRow.userId } });
  } catch (err) {
    renderDrillView();
    setError(err.message || 'Failed to load user sessions');
  } finally {
    isDrillLoading = false;
  }
}

async function openGameUsers(gameRow) {
  if (isDrillLoading || !gameRow) return;
  isDrillLoading = true;
  setError('');
  showDrillLoading('Loading users for ' + (gameRow.gameName || 'game') + '…');

  try {
    let users = gameRow.users;
    if (!isDemoMode()) {
      users = await fetchGameUsers(gameRow.gameId);
    } else if (!Array.isArray(users)) {
      users = [];
    }
    pushDrill({ type: 'game-users', game: { ...gameRow, users } });
  } catch (err) {
    renderDrillView();
    setError(err.message || 'Failed to load game users');
  } finally {
    isDrillLoading = false;
  }
}

async function openSessionGraph(session) {
  if (isDrillLoading || !session) return;
  isDrillLoading = true;
  setError('');
  showDrillLoading('Loading session spins…');

  try {
    let spinLogs = session.spinLogs;
    if (!isDemoMode()) {
      spinLogs = await fetchSessionSpins(session.sessionId);
    } else if (!Array.isArray(spinLogs)) {
      spinLogs = [];
    }
    pushDrill({ type: 'spins', session: { ...session, spinLogs } });
  } catch (err) {
    renderDrillView();
    setError(err.message || 'Failed to load session spins');
  } finally {
    isDrillLoading = false;
  }
}

/** Graph buttons carry data-drill (row kind) and data-id; resolve the row and open the next level. */
function handleDrillClick(button) {
  const kind = button.dataset.drill;
  const id = String(button.dataset.id);
  const byId = (key) => (row) => String(row[key]) === id;

  if (kind === 'game' || kind === 'user') {
    const row = findSummaryRow(kind, id);
    if (!row) return;
    if (kind === 'game') openGameUsers(row);
    else openUserSessions(row);
    return;
  }

  const frame = currentDrillFrame();
  if (kind === 'online-user' && frame?.type === 'online-users') {
    const user = (frame.users || []).find(byId('userId'));
    if (user) openUserSessions(user);
    return;
  }

  if (kind === 'game-user' && frame?.type === 'game-users') {
    const user = (frame.game.users || []).find(byId('userId'));
    if (user) {
      pushDrill({
        type: 'sessions',
        title: user.username + ' · ' + frame.game.gameName,
        sessions: user.sessions || [],
        source: { gameId: frame.game.gameId, userId: user.userId },
      });
    }
    return;
  }

  if (kind === 'session' && frame?.type === 'sessions') {
    const session = (frame.sessions || []).find(byId('sessionId'));
    if (session) openSessionGraph(session);
  }
}

// ---- Owner transactions ----

// "Owner Totals" KPI drill-down: paged owner recharge / redeem / generated-coin transactions.

const OWNER_TX_PAGE_SIZE = 25;

async function fetchOwnerTransactions({ type = 'all', page = 1, pageSize = OWNER_TX_PAGE_SIZE, account = '', from = '', to = '' } = {}) {
  if (isDemoMode()) {
    return getDemoOwnerTransactions({ type, page, pageSize, account });
  }

  const params = new URLSearchParams();
  params.set('type', type || 'all');
  params.set('page', String(page || 1));
  params.set('pageSize', String(pageSize || OWNER_TX_PAGE_SIZE));
  if (account) params.set('account', account);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const json = await fetchApiJson('/owner-transactions?' + params.toString());
  const data = json.data || {};
  return {
    items: data.items || data.Items || [],
    totalCount: Number(apiField(data, 'totalCount', 0)),
    page: Number(apiField(data, 'page', page)),
    pageSize: Number(apiField(data, 'pageSize', pageSize)),
    type: data.type || data.Type || type,
  };
}

function getSelectedOwnerTxType() {
  const active = document.querySelector('.owner-tx-type-btn.is-active');
  return active?.dataset.ownerType || 'all';
}

function setOwnerTxTypeButtons(type) {
  const selected = type || 'all';
  document.querySelectorAll('.owner-tx-type-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.ownerType === selected);
  });
}

function readOwnerTxFilterInputs() {
  return {
    account: ($('ownerTxAccount')?.value || '').trim(),
    from: $('ownerTxFrom')?.value || '',
    to: $('ownerTxTo')?.value || '',
  };
}

function syncOwnerTxToolbar(frame) {
  setOwnerTxTypeButtons(frame.txType || 'all');
  setInputValue('ownerTxAccount', frame.account || '');
  setInputValue('ownerTxFrom', frame.from || '');
  setInputValue('ownerTxTo', frame.to || '');
}

function ownerTxTotalPages(frame) {
  if (!frame) return 1;
  if (Number.isFinite(Number(frame.totalPages)) && Number(frame.totalPages) > 0) {
    return Math.max(1, Number(frame.totalPages));
  }
  const pageSize = Number(frame.pageSize || OWNER_TX_PAGE_SIZE) || OWNER_TX_PAGE_SIZE;
  return pageCount(Number(frame.totalCount || 0), pageSize);
}

function renderOwnerTxPager(frame) {
  const pager = $('ownerTxPager');
  if (!pager) return;
  const total = Number(frame.totalCount || 0);
  const pageSize = Number(frame.pageSize || OWNER_TX_PAGE_SIZE);
  const totalPages = pageCount(total, pageSize);
  frame.totalPages = totalPages;
  setHtml(pager, renderPagerHtml({
    dataAttr: 'data-owner-page',
    page: Number(frame.page || 1),
    pageSize,
    total,
    totalPages,
    jumpInputId: 'ownerTxPageJump',
  }));
}

function isOwnerTxFrame(frame) {
  return !!frame && frame.type === 'owner-transactions';
}

function jumpOwnerTransactionsPage(targetPage) {
  const frame = currentDrillFrame();
  if (!isOwnerTxFrame(frame) || isDrillLoading) return;
  const totalPages = ownerTxTotalPages(frame);
  const parsed = parseInt(String(targetPage ?? '').trim(), 10);
  const page = Number.isFinite(parsed) ? Math.min(totalPages, Math.max(1, parsed)) : 1;
  if (page === Number(frame.page || 1)) return;
  loadOwnerTransactionsPage({ page });
}

function handleOwnerTxPagerClick(e) {
  const btn = e.target.closest('[data-owner-page]');
  if (!btn || btn.disabled || isDrillLoading) return;
  const frame = currentDrillFrame();
  if (!isOwnerTxFrame(frame)) return;

  e.preventDefault();
  e.stopPropagation();

  const page = Number(frame.page || 1);
  const targets = {
    first: () => 1,
    prev: () => page - 1,
    next: () => page + 1,
    last: () => ownerTxTotalPages(frame),
    goto: () => $('ownerTxPageJump')?.value,
  };
  const target = targets[btn.getAttribute('data-owner-page') || ''];
  if (target) jumpOwnerTransactionsPage(target());
}

function normalizeOwnerTx(r) {
  return {
    type: apiField(r, 'type', ''),
    id: apiField(r, 'id', ''),
    ticket: apiField(r, 'ticket', ''),
    actor: apiField(r, 'actor', ''),
    account: apiField(r, 'account', ''),
    date: apiField(r, 'date', ''),
    amount: apiField(r, 'amount', 0),
    before: apiField(r, 'before', 0),
    after: apiField(r, 'after', 0),
    currentCoin: apiField(r, 'currentCoin', null),
    cashier: apiField(r, 'cashier', ''),
    remark: apiField(r, 'remark', ''),
    gameId: apiField(r, 'gameId', ''),
  };
}

function ownerTxKind(row) {
  return String(row.type || '').toLowerCase();
}

/** Balance columns do not apply to generated coins. */
function ownerTxBalanceCell(row, key) {
  return ownerTxKind(row) === 'generated' ? EMPTY_CELL_HTML : ('$' + fmtMoney(row[key]));
}

function renderOwnerTransactionsDrill(frame) {
  syncOwnerTxToolbar(frame);
  renderOwnerTxPager(frame);
  const total = Number(frame.totalCount || 0);
  setDrillHeader(
    (frame.txType || 'all') === 'generated' ? 'Owner Generated Coins' : 'Owner Recharge & Redeem',
    frame.loading ? 'Loading…' : countLabel(total, 'record')
  );

  if (frame.loading && !(frame.items || []).length) {
    setHtml('drillTableWrap', skeletonHtml(10));
    return;
  }
  renderTable('drillTableWrap', (frame.items || []).map(normalizeOwnerTx), OWNER_TX_COLUMNS, 'No records match these filters.');
}

const OWNER_TX_TONES = { recharge: 'up', redeem: 'warn', generated: 'purple' };

const OWNER_TX_COLUMNS = [
  { label: 'Type', render: (r) => badgeHtml(String(r.type || '') || '—', OWNER_TX_TONES[ownerTxKind(r)] || 'up') },
  { label: 'Date', render: (r) => renderTimezoneDateHtml(r.date) },
  {
    label: 'Account',
    render: (r) => r.account ? '<span class="cell-user">' + escHtml(r.account) + '</span>' : EMPTY_CELL_HTML,
  },
  { label: 'Before', align: 'right', render: (r) => ownerTxBalanceCell(r, 'before') },
  { label: 'Amount', align: 'right', render: (r) => moneyHtml(r.amount, OWNER_TX_TONES[ownerTxKind(r)] || 'up') },
  { label: 'After', align: 'right', render: (r) => ownerTxBalanceCell(r, 'after') },
  {
    label: 'Current coin',
    align: 'right',
    render: (r) => (r.currentCoin == null || r.currentCoin === '') ? EMPTY_CELL_HTML : ('$' + fmtMoney(r.currentCoin)),
  },
  {
    label: 'Game ID',
    render: (r) => r.gameId ? '<span class="cell-id game-id">' + escHtml(r.gameId) + '</span>' : EMPTY_CELL_HTML,
  },
  { label: 'Actor', key: 'actor' },
  { label: 'Cashier', key: 'cashier' },
  { label: 'Ticket', key: 'ticket' },
  { label: 'Remark', key: 'remark' },
];

async function loadOwnerTransactionsPage(overrides = {}) {
  const frame = currentDrillFrame();
  if (!isOwnerTxFrame(frame) || isDrillLoading) return;

  const parsedPage = parseInt(String(overrides.page ?? frame.page ?? 1), 10);
  const next = {
    txType: overrides.txType ?? frame.txType ?? 'all',
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize: Number(overrides.pageSize ?? frame.pageSize ?? OWNER_TX_PAGE_SIZE) || OWNER_TX_PAGE_SIZE,
    account: overrides.account ?? frame.account ?? '',
    from: overrides.from ?? frame.from ?? '',
    to: overrides.to ?? frame.to ?? '',
  };

  isDrillLoading = true;
  frame.loading = true;
  setText('drillMeta', 'Loading…');
  $('drillTableWrap')?.classList.add('is-loading');
  try {
    const data = await fetchOwnerTransactions({
      type: next.txType,
      page: next.page,
      pageSize: next.pageSize,
      account: next.account,
      from: next.from,
      to: next.to,
    });
    const totalCount = Number(data.totalCount || 0);
    const pageSize = Number(data.pageSize || next.pageSize) || OWNER_TX_PAGE_SIZE;
    const totalPages = pageCount(totalCount, pageSize);
    const page = Math.min(Number(data.page || next.page) || 1, totalPages);
    Object.assign(frame, {
      txType: data.type || next.txType,
      page,
      pageSize,
      totalPages,
      account: next.account,
      from: next.from,
      to: next.to,
      items: data.items,
      totalCount,
      loading: false,
    });
    renderDrillView();
  } catch (err) {
    frame.loading = false;
    setError(err.message || 'Failed to load owner transactions');
    renderDrillView();
  } finally {
    isDrillLoading = false;
    $('drillTableWrap')?.classList.remove('is-loading');
  }
}

/** `txType`: all | recharge | redeem | generated (cash-flow rows open the matching type). */
async function openOwnerTransactions(txType = 'all') {
  if (isDrillLoading) return;
  pushDrill({
    type: 'owner-transactions',
    txType,
    page: 1,
    pageSize: OWNER_TX_PAGE_SIZE,
    account: '',
    from: '',
    to: '',
    items: [],
    totalCount: 0,
    loading: true,
  });
  await loadOwnerTransactionsPage({ page: 1, txType });
}

function bindOwnerTransactionEvents() {
  $('ownerTxPager')?.addEventListener('click', handleOwnerTxPagerClick);
  $('ownerTxFilterBtn')?.addEventListener('click', () => {
    loadOwnerTransactionsPage({ page: 1, txType: getSelectedOwnerTxType(), ...readOwnerTxFilterInputs() });
  });
  $('ownerTxClearBtn')?.addEventListener('click', () => {
    setOwnerTxTypeButtons('all');
    setInputValue('ownerTxAccount', '');
    setInputValue('ownerTxFrom', '');
    setInputValue('ownerTxTo', '');
    loadOwnerTransactionsPage({ page: 1, txType: 'all', account: '', from: '', to: '' });
  });
  document.querySelectorAll('.owner-tx-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.ownerType || 'all';
      setOwnerTxTypeButtons(type);
      loadOwnerTransactionsPage({ page: 1, txType: type, ...readOwnerTxFilterInputs() });
    });
  });
  $('ownerTxAccount')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('ownerTxFilterBtn')?.click();
  });
}
