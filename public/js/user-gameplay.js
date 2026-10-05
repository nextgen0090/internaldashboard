// User Game Play page: per-user summary, daily breakdown and paged spin logs.

const GUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UGP_SPINS_PAGE_SIZE = 50;
const UGP_TABS = ['summary', 'daily', 'spins'];
const UGP_SUMMARY_HINT = 'Enter a username to run dbo.GetUserGamePlaySummary.';
const UGP_DAILY_HINT = 'Enter a user ID to load daily Bet / Win / RTP from game_spin_logs.';
const UGP_SPINS_HINT = 'Enter a user ID to load spin rows from game_spin_logs (ordered by created_at).';

let userGameplayGamesData = [];
let userGameplayLastUserName = '';
let userGameplayDailyData = [];
let userGameplayDailyMeta = { userId: '', userName: '' };
let userGameplaySpinsData = [];
let userGameplaySpinsMeta = emptySpinsMeta();
let userGameplayActiveTab = 'summary';
let userGameplaySpinsLoading = false;

function emptySpinsMeta() {
  return { userId: '', userName: '', page: 1, pageSize: UGP_SPINS_PAGE_SIZE, totalCount: 0 };
}

function setUserGameplayStatus(text) {
  setText('userGameplayStatus', text);
}

/** The shared row counter belongs to whichever tab is active. */
function setTabRowCount(tab, rows) {
  if (userGameplayActiveTab === tab) setRowCount('countUserGameplay', rows);
}

function userLabel(meta) {
  return meta.userName ? meta.userName + ' (' + meta.userId + ')' : meta.userId;
}

/** Table wrap content between lookups: skeleton while loading, otherwise empty. */
function resetTableWrap(id, loading) {
  setHtml(id, loading ? skeletonHtml(8) : '');
}

function normalizeSearch(query) {
  return String(query || '').trim().toLowerCase();
}

/** Read and validate a GUID user ID input; on failure show `clearUi(message)` and return ''. */
function readGuidUserId(inputId, clearUi) {
  const input = $(inputId);
  const userId = (input?.value || '').trim();
  let error = '';
  if (!userId) error = 'Enter a user ID first.';
  else if (!GUID_PATTERN.test(userId)) error = 'User ID must be a valid GUID.';
  if (error) {
    clearUi(error);
    input?.focus();
    return '';
  }
  return userId;
}

// ---- Charts (plot the same filtered rows as the table below them) ----

const UGP_CHART_GAME_LIMIT = 24;
const moneyAxis = (n) => '$' + fmtCompact(n);
const pctAxis = (n) => Number(n).toFixed(0) + '%';

/** Per-game / summary RTP in percent from the row totals (same win ÷ bet as everywhere else). */
function ugpRtpPercent(row) {
  return rtpRatio(apiField(row, 'totalBet', 0), apiField(row, 'totalWin', 0)) * 100;
}

function ugpDailyRtp(row) {
  return rtpRatio(apiField(row, 'bet', 0), apiField(row, 'win', 0));
}

function betWinTip(title, bet, win, extra = '') {
  return title + '\nBet $' + fmtMoney(bet) + ' · Win $' + fmtMoney(win) + (extra ? '\n' + extra : '');
}

function renderUgpGamesChart(rows) {
  if (!rows.length) return setHtml('ugpGamesChart', '');
  const top = rows.slice()
    .sort((a, b) => Number(apiField(b, 'totalBet', 0)) - Number(apiField(a, 'totalBet', 0)))
    .slice(0, UGP_CHART_GAME_LIMIT);
  const bets = top.map((g) => Number(apiField(g, 'totalBet', 0)));
  const wins = top.map((g) => Number(apiField(g, 'totalWin', 0)));
  const rtps = top.map(ugpRtpPercent);
  setHtml('ugpGamesChart', chartCardHtml(
    'Bet vs win by game',
    top.length < rows.length ? 'Top ' + top.length + ' of ' + rows.length + ' games by bet' : 'Sorted by bet',
    comboChartHtml({
      labels: top.map((g) => String(apiField(g, 'gameName', ''))),
      columns: [{ name: 'Bet', tone: 'bet', values: bets }, { name: 'Win', tone: 'up', values: wins }],
      line: { name: 'RTP', tone: 'warn', values: rtps, format: pctAxis },
      format: moneyAxis,
      tips: top.map((g, i) => betWinTip(apiField(g, 'gameName', ''), bets[i], wins[i], 'RTP ' + fmtRtpPercent(rtps[i]) + ' · ' + fmtInt(apiField(g, 'totalSpins', 0)) + ' spins')),
      height: 200,
    })
  ));
}

/** Daily rows are per (date, game); the chart sums them per date. */
function renderUgpDailyChart(rows) {
  if (!rows.length) return setHtml('ugpDailyChart', '');
  const byDate = new Map();
  rows.forEach((r) => {
    const date = String(apiField(r, 'date', ''));
    const day = byDate.get(date) || { bet: 0, win: 0, spins: 0, games: 0 };
    day.bet += Number(apiField(r, 'bet', 0));
    day.win += Number(apiField(r, 'win', 0));
    day.spins += Number(apiField(r, 'spins', 0));
    day.games += 1;
    byDate.set(date, day);
  });
  const dates = [...byDate.keys()].sort();
  const days = dates.map((d) => byDate.get(d));
  const rtps = days.map((d) => rtpRatio(d.bet, d.win) * 100);
  setHtml('ugpDailyChart', chartCardHtml(
    'Daily bet vs win',
    countLabel(dates.length, 'day') + ' · RTP = win ÷ bet per day',
    comboChartHtml({
      labels: dates.map((d) => d.slice(5) || d),
      columns: [{ name: 'Bet', tone: 'bet', values: days.map((d) => d.bet) }, { name: 'Win', tone: 'up', values: days.map((d) => d.win) }],
      line: { name: 'RTP', tone: 'warn', values: rtps, format: pctAxis },
      format: moneyAxis,
      tips: days.map((d, i) => betWinTip(dates[i], d.bet, d.win, 'RTP ' + fmtRtpPercent(rtps[i]) + ' · ' + fmtInt(d.spins) + ' spins · ' + countLabel(d.games, 'game'))),
      height: 200,
    })
  ));
}

function renderUgpSpinsChart(rows) {
  if (rows.length < 2) return setHtml('ugpSpinsChart', '');
  const sorted = rows.slice().sort((a, b) =>
    (utcMillis(apiField(a, 'createdAt', '')) || 0) - (utcMillis(apiField(b, 'createdAt', '')) || 0));
  const bets = sorted.map((r) => Number(apiField(r, 'betAmount', 0)));
  const wins = sorted.map((r) => Number(apiField(r, 'winAmount', 0)));
  const balances = sorted.map((r) => Number(apiField(r, 'balanceAfter', 0)));
  setHtml('ugpSpinsChart', chartCardHtml(
    'Balance over this page',
    countLabel(sorted.length, 'spin') + ' in time order',
    comboChartHtml({
      labels: sorted.map((r) => formatDateTime24h(apiField(r, 'createdAt', '')).slice(-5)),
      columns: [{ name: 'Bet', tone: 'bet', values: bets }, { name: 'Win', tone: 'up', values: wins }],
      line: { name: 'Balance after', tone: 'info', values: balances, format: (n) => '$' + fmtInt(n), fromZero: false },
      format: moneyAxis,
      tips: sorted.map((r, i) => betWinTip(
        formatDateTime(apiField(r, 'createdAt', '')) + ' · ' + apiField(r, 'gameName', ''),
        bets[i], wins[i],
        'Balance $' + fmtMoney(apiField(r, 'balanceBefore', 0)) + ' → $' + fmtMoney(balances[i]) + (apiField(r, 'isFreeSpin') ? ' · free spin' : '')
      )),
      height: 180,
    })
  ));
}

async function fetchUserGameplayJson(pathAndQuery) {
  const json = await fetchApiJson('/user-game-play' + pathAndQuery);
  return json.data || json.Data || {};
}

// ---- Summary tab ----

function matchesUserGameplaySearch(row, query) {
  const q = normalizeSearch(query);
  if (!q) return true;
  if (String(apiField(row, 'gameName', '')).toLowerCase().includes(q)) return true;

  const bet = apiField(row, 'totalBet', 0);
  const win = apiField(row, 'totalWin', 0);
  const rtp = ugpRtpPercent(row);
  return matchesAnyText([
    String(apiField(row, 'totalSpins', 0)),
    String(apiField(row, 'totalFreeSpins', 0)),
    fmtMoney(bet),
    fmtMoney(win),
    String(bet),
    String(win),
    rtp.toFixed(2),
    String(rtp),
    rtp.toFixed(2) + '%',
    Math.round(rtp) + '%',
    String(Math.round(rtp)),
  ], q);
}

function clearUserGameplayUi(message, loading = false) {
  userGameplayGamesData = [];
  userGameplayLastUserName = '';
  setUserGameplayStatus(message || UGP_SUMMARY_HINT);
  const summary = $('userGameplaySummary');
  if (summary) {
    setHtml(summary, '');
    show(summary, false);
  }
  show($('userGameplayTableToolbar'), false);
  setInputValue('userGameplaySearch', '');
  resetTableWrap('userGameplayGamesWrap', loading);
  setHtml('ugpGamesChart', '');
  setRowCount('countUserGameplay', []);
}

/** Attach sort getters by column label: a string API key sorts numerically, a function is used as is. */
function sortableColumns(columns, sorts) {
  return columns.map((c) => {
    const s = sorts[c.label];
    if (!s) return c;
    return { ...c, sort: typeof s === 'function' ? s : (r) => Number(apiField(r, s, 0)) };
  });
}

const textField = (key) => (r) => String(apiField(r, key, ''));

const UGP_GAME_COLUMNS = sortableColumns([
  { label: 'Game', render: (g) => '<span class="cell-game">' + escHtml(apiField(g, 'gameName', '')) + '</span>' },
  { label: 'Total Bet', align: 'right', render: (g) => moneyHtml(apiField(g, 'totalBet', 0), 'bet') },
  {
    label: 'Total Win',
    align: 'right',
    render: (g) => moneyHtml(apiField(g, 'totalWin', 0), winTone(apiField(g, 'totalBet', 0), apiField(g, 'totalWin', 0))),
  },
  {
    label: 'RTP',
    align: 'right',
    render: (g) => valHtml(fmtRtpPercent(ugpRtpPercent(g)), rtpTone(ugpRtpPercent(g))),
  },
  { label: 'Spins', align: 'right', render: (g) => fmtInt(apiField(g, 'totalSpins', 0)) },
  { label: 'Free Spins', align: 'right', render: (g) => valHtml(fmtInt(apiField(g, 'totalFreeSpins', 0)), 'purple') },
], {
  'Game': textField('gameName'),
  'Total Bet': 'totalBet',
  'Total Win': 'totalWin',
  'RTP': ugpRtpPercent,
  'Spins': 'totalSpins',
  'Free Spins': 'totalFreeSpins',
});

function renderUserGameplayGamesTable() {
  const search = $('userGameplaySearch')?.value || '';
  const query = String(search).trim();
  const filtered = userGameplayGamesData.filter((r) => matchesUserGameplaySearch(r, search));
  const total = userGameplayGamesData.length;
  const emptyMsg = total ? 'No games match "' + query + '".' : 'No per-game rows.';

  renderUgpGamesChart(filtered);
  renderTable('userGameplayGamesWrap', filtered, UGP_GAME_COLUMNS, emptyMsg, {
    explore: 'userGameplayGamesWrap',
    rerender: renderUserGameplayGamesTable,
    resetKey: userGameplayLastUserName + '|' + query,
  });
  setRowCount('countUserGameplay', filtered);

  if (userGameplayLastUserName && total) {
    const prefix = 'Results for ' + userGameplayLastUserName + ' · ';
    setUserGameplayStatus(query
      ? prefix + filtered.length + ' of ' + total + ' games'
      : prefix + countLabel(total, 'game'));
  }
}

function renderUserGameplaySummaryCards(summary, userName, userId) {
  const bet = apiField(summary, 'totalBet', 0);
  const win = apiField(summary, 'totalWin', 0);
  const rtp = ugpRtpPercent(summary);
  const idActions = userId
    ? '<div class="ugp-id-actions">' +
      '<button type="button" class="secondary sm" data-ugp-use-userid="' + escAttr(userId) + '" data-ugp-goto="daily">Daily</button>' +
      '<button type="button" class="secondary sm" data-ugp-use-userid="' + escAttr(userId) + '" data-ugp-goto="spins">Spins</button>' +
      '</div>'
    : '';
  return [
    statHtml('User', escHtml(userName), 'info'),
    statHtml('User ID', userId ? '<span class="ugp-id">' + escHtml(userId) + '</span>' : '—', '', idActions),
    statHtml('Total Bet', '$' + fmtMoney(bet), 'bet'),
    statHtml('Total Win', '$' + fmtMoney(win), winTone(bet, win)),
    statHtml('Total Recharge', '$' + fmtMoney(apiField(summary, 'totalRecharge', 0)), 'up'),
    statHtml('Total Redeem', '$' + fmtMoney(apiField(summary, 'totalRedeem', 0)), 'warn'),
    statHtml('RTP', fmtRtpPercent(rtp), rtpTone(rtp)),
  ].join('');
}

function renderUserGameplay(data) {
  const summary = data?.summary || data?.Summary || null;
  const games = data?.games || data?.Games || [];
  const summaryEl = $('userGameplaySummary');
  const rootUserId = data?.userId || data?.UserId || summary?.userId || summary?.UserId || '';

  if (!summary && !games.length) {
    clearUserGameplayUi('No data returned for this username.');
    setHtml('userGameplayGamesWrap', emptyHtml('No data returned for this username.'));
    return;
  }

  userGameplayGamesData = games;
  const userName = summary?.userName || summary?.UserName || games[0]?.userName || games[0]?.UserName || '';
  userGameplayLastUserName = userName;
  setUserGameplayStatus('Results for ' + userName + ' · ' + countLabel(games.length, 'game'));
  show($('userGameplayTableToolbar'), games.length > 0);

  if (summaryEl) {
    setHtml(summaryEl, summary ? renderUserGameplaySummaryCards(summary, userName, String(rootUserId || '')) : '');
    show(summaryEl, !!summary);
  }

  renderUserGameplayGamesTable();
}

async function fetchUserGameplay(userName) {
  if (isDemoMode()) return getDemoUserGameplay(userName);
  return fetchUserGameplayJson('?userName=' + encodeURIComponent(userName));
}

/**
 * Latest request wins: Enter can start a lookup while another is still in flight, so each lookup
 * kind keeps a counter and a response is only applied if no newer lookup (or Clear) happened since.
 */
const ugpLookupTokens = { summary: 0, daily: 0, spins: 0 };

function nextLookupToken(kind) {
  ugpLookupTokens[kind] += 1;
  return ugpLookupTokens[kind];
}

function isLatestLookup(kind, token) {
  return ugpLookupTokens[kind] === token;
}

const UGP_LOOKUP_BUTTONS = {
  summary: 'userGameplayLookupBtn',
  daily: 'userGameplayDailyLookupBtn',
  spins: 'userGameplaySpinsLookupBtn',
};

/** Invalidates any in-flight lookup of this kind and restores its idle controls (the stale one won't). */
function cancelLookup(kind) {
  nextLookupToken(kind);
  const btn = $(UGP_LOOKUP_BUTTONS[kind]);
  if (btn) btn.disabled = false;
  if (kind === 'spins') {
    userGameplaySpinsLoading = false;
    $('userGameplaySpinsWrap')?.classList.remove('is-loading');
  }
}

async function lookupUserGameplay() {
  const input = $('userGameplayName');
  const userName = (input?.value || '').trim();
  if (!userName) {
    cancelLookup('summary');
    clearUserGameplayUi('Enter a username first.');
    input?.focus();
    return;
  }

  const token = nextLookupToken('summary');
  const btn = $('userGameplayLookupBtn');
  if (btn) btn.disabled = true;
  try {
    clearUserGameplayUi('Looking up ' + userName + '…', true);
    const data = await fetchUserGameplay(userName);
    if (isLatestLookup('summary', token)) renderUserGameplay(data);
  } catch (err) {
    if (!isLatestLookup('summary', token)) return;
    const message = 'Lookup failed: ' + (err?.message || String(err));
    clearUserGameplayUi(message);
    setHtml('userGameplayGamesWrap', errorHtml(message));
  } finally {
    if (btn && isLatestLookup('summary', token)) btn.disabled = false;
  }
}

// ---- Tabs ----

function setUserGameplayTab(tab) {
  userGameplayActiveTab = UGP_TABS.includes(tab) ? tab : 'summary';
  const active = userGameplayActiveTab;
  document.querySelectorAll('.user-gameplay-tab-btn').forEach((btn) => {
    const on = btn.dataset.ugpTab === active;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  show($('userGameplaySummaryToolbar'), active === 'summary');
  show($('userGameplayDailyToolbar'), active === 'daily');
  show($('userGameplaySpinsToolbar'), active === 'spins');
  show($('userGameplaySummaryPanel'), active === 'summary');
  show($('userGameplayDailyPanel'), active === 'daily');
  show($('userGameplaySpinsPanel'), active === 'spins');

  // Keep User ID in sync across Daily / Spins.
  const dailyId = ($('userGameplayUserId')?.value || '').trim();
  const spinsId = ($('userGameplaySpinsUserId')?.value || '').trim();
  if (active === 'spins' && !spinsId && dailyId) setInputValue('userGameplaySpinsUserId', dailyId);
  if (active === 'daily' && !dailyId && spinsId) setInputValue('userGameplayUserId', spinsId);

  const showEmptyHint = (hint) => {
    setUserGameplayStatus(hint);
    setRowCount('countUserGameplay', []);
  };

  if (active === 'summary') {
    if (userGameplayGamesData.length) renderUserGameplayGamesTable();
    else showEmptyHint(UGP_SUMMARY_HINT);
    $('userGameplayName')?.focus();
  } else if (active === 'daily') {
    if (userGameplayDailyData.length) renderUserGameplayDailyTable();
    else showEmptyHint(UGP_DAILY_HINT);
    $('userGameplayUserId')?.focus();
  } else {
    if (userGameplaySpinsData.length || Number(userGameplaySpinsMeta.totalCount || 0) > 0) renderUserGameplaySpinsTable();
    else showEmptyHint(UGP_SPINS_HINT);
    $('userGameplaySpinsUserId')?.focus();
  }
}

/** Summary card "Daily" / "Spins" buttons: copy the user ID into both tabs and run that lookup. */
function useUserIdFromSummary(button) {
  const uid = button.getAttribute('data-ugp-use-userid') || '';
  const goto = button.getAttribute('data-ugp-goto') || 'daily';
  if (!uid) return;
  setInputValue('userGameplayUserId', uid);
  setInputValue('userGameplaySpinsUserId', uid);
  setUserGameplayTab(goto === 'spins' ? 'spins' : 'daily');
  if (goto === 'spins') lookupUserGameplaySpins({ page: 1 });
  else lookupUserGameplayDaily();
}

// ---- Daily tab ----

function matchesUserGameplayDailySearch(row, query) {
  const q = normalizeSearch(query);
  if (!q) return true;
  if (['gameName', 'gameId', 'date'].some((key) => String(apiField(row, key, '')).toLowerCase().includes(q))) return true;

  const bet = apiField(row, 'bet', 0);
  const win = apiField(row, 'win', 0);
  const rtp = ugpDailyRtp(row);
  const rtpPct = rtp * 100;
  return matchesAnyText([
    String(apiField(row, 'spins', 0)),
    fmtMoney(bet),
    fmtMoney(win),
    String(bet),
    String(win),
    rtp.toFixed(4),
    String(rtp),
    rtpPct.toFixed(2),
    rtpPct.toFixed(2) + '%',
    Math.round(rtpPct) + '%',
    String(Math.round(rtpPct)),
  ], q);
}

function clearUserGameplayDailyUi(message, loading = false) {
  userGameplayDailyData = [];
  userGameplayDailyMeta = { userId: '', userName: '' };
  setUserGameplayStatus(message || UGP_DAILY_HINT);
  show($('userGameplayDailySearchWrap'), false);
  setInputValue('userGameplayDailySearch', '');
  resetTableWrap('userGameplayDailyWrap', loading);
  setHtml('ugpDailyChart', '');
  setTabRowCount('daily', []);
}

function dailySpinsCell(gameId, date, name, spins) {
  const canOpen = !!userGameplayDailyMeta.userId && !!gameId && !!date && Number(spins) > 0;
  const count = '<span class="val">' + fmtInt(spins) + '</span>';
  if (!canOpen) return count;
  return '<button type="button" class="ugp-daily-spins-link" data-ugp-daily-spins="1"' +
    ' data-game-id="' + escAttr(gameId) + '"' +
    ' data-date="' + escAttr(date) + '"' +
    ' data-game-name="' + escAttr(name) + '"' +
    ' data-tip="' + escAttr('Open all spins for ' + name + ' on ' + date) + '"' +
    ' aria-label="' + escAttr('Open ' + fmtInt(spins) + ' spins') + '">' +
    count +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"></path></svg>' +
    '</button>';
}

const UGP_DAILY_COLUMNS = sortableColumns([
  { label: 'Date', render: (r) => '<span class="cell-date">' + escHtml(apiField(r, 'date', '')) + '</span>' },
  { label: 'Game', render: (r) => '<span class="cell-game">' + escHtml(apiField(r, 'gameName', '')) + '</span>' },
  { label: 'Game ID', render: (r) => '<span class="cell-id">' + escHtml(apiField(r, 'gameId', '')) + '</span>' },
  { label: 'Bet', align: 'right', render: (r) => moneyHtml(apiField(r, 'bet', 0), 'bet') },
  {
    label: 'Win',
    align: 'right',
    render: (r) => moneyHtml(apiField(r, 'win', 0), winTone(apiField(r, 'bet', 0), apiField(r, 'win', 0))),
  },
  {
    label: 'RTP',
    align: 'right',
    render: (r) => valHtml(fmtRtp(ugpDailyRtp(r)), rtpTone(ugpDailyRtp(r) * 100)),
  },
  {
    label: 'Spins',
    align: 'right',
    render: (r) => dailySpinsCell(apiField(r, 'gameId', ''), apiField(r, 'date', ''), apiField(r, 'gameName', ''), apiField(r, 'spins', 0)),
  },
], {
  'Date': textField('date'),
  'Game': textField('gameName'),
  'Bet': 'bet',
  'Win': 'win',
  'RTP': ugpDailyRtp,
  'Spins': 'spins',
});

function renderUserGameplayDailyTable() {
  const search = $('userGameplayDailySearch')?.value || '';
  const query = String(search).trim();
  const filtered = userGameplayDailyData.filter((r) => matchesUserGameplayDailySearch(r, search));
  const total = userGameplayDailyData.length;
  const label = userLabel(userGameplayDailyMeta);

  renderUgpDailyChart(filtered);
  renderTable('userGameplayDailyWrap', filtered, UGP_DAILY_COLUMNS, total ? 'No rows match "' + query + '".' : 'No daily rows.', {
    explore: 'userGameplayDailyWrap',
    rerender: renderUserGameplayDailyTable,
    resetKey: userGameplayDailyMeta.userId + '|' + query,
  });
  setTabRowCount('daily', filtered);

  if (label && total) {
    setUserGameplayStatus(query
      ? 'Results for ' + label + ' · ' + filtered.length + ' of ' + total + ' rows'
      : 'Results for ' + label + ' · ' + countLabel(total, 'row'));
  }
}

function renderUserGameplayDaily(data) {
  const rows = data?.rows || data?.Rows || [];
  const userId = data?.userId || data?.UserId || '';
  const userName = data?.userName || data?.UserName || '';
  userGameplayDailyData = rows;
  userGameplayDailyMeta = { userId: String(userId), userName: String(userName || '') };
  show($('userGameplayDailySearchWrap'), rows.length > 0);

  renderUserGameplayDailyTable();
  if (!rows.length) setUserGameplayStatus('No daily spin data for ' + (userLabel(userGameplayDailyMeta) || 'this user') + '.');
}

async function fetchUserGameplayDaily(userId, from, to) {
  if (isDemoMode()) return getDemoUserGameplayDaily(userId);

  const params = new URLSearchParams();
  params.set('userId', userId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return fetchUserGameplayJson('/daily?' + params.toString());
}

async function lookupUserGameplayDaily() {
  const userId = readGuidUserId('userGameplayUserId', clearUserGameplayDailyUi);
  if (!userId) {
    cancelLookup('daily');
    return;
  }
  const token = nextLookupToken('daily');

  const from = $('userGameplayDailyFrom')?.value || '';
  const to = $('userGameplayDailyTo')?.value || '';
  const btn = $('userGameplayDailyLookupBtn');
  if (btn) btn.disabled = true;
  try {
    clearUserGameplayDailyUi('Looking up ' + userId + '…', true);
    const data = await fetchUserGameplayDaily(userId, from, to);
    if (isLatestLookup('daily', token)) renderUserGameplayDaily(data);
  } catch (err) {
    if (!isLatestLookup('daily', token)) return;
    const message = 'Lookup failed: ' + (err?.message || String(err));
    clearUserGameplayDailyUi(message);
    setHtml('userGameplayDailyWrap', errorHtml(message));
  } finally {
    if (btn && isLatestLookup('daily', token)) btn.disabled = false;
  }
}

function openDailyRowSpins(gameId, date, gameName) {
  const userId = (userGameplayDailyMeta.userId || $('userGameplayUserId')?.value || '').trim();
  if (!userId || !gameId || !date) return;

  setInputValue('userGameplaySpinsUserId', userId);
  setInputValue('userGameplaySpinsFrom', date);
  setInputValue('userGameplaySpinsTo', date);
  setInputValue('userGameplaySpinsGameId', gameId);
  setInputValue('userGameplaySpinsSearch', '');

  setUserGameplayTab('spins');
  lookupUserGameplaySpins({ page: 1, from: date, to: date, gameId, gameName: gameName || '' });
}

// ---- Spins tab ----

function matchesUserGameplaySpinsSearch(row, query) {
  const q = normalizeSearch(query);
  if (!q) return true;
  if (['gameName', 'gameId'].some((key) => String(apiField(row, key, '')).toLowerCase().includes(q))) return true;
  if (String(apiField(row, 'createdAt', '')).toLowerCase().includes(q)) return true;

  const before = apiField(row, 'balanceBefore', 0);
  const bet = apiField(row, 'betAmount', 0);
  const win = apiField(row, 'winAmount', 0);
  const after = apiField(row, 'balanceAfter', 0);
  return matchesAnyText([
    String(apiField(row, 'spinIndex', 0)),
    fmtMoney(before),
    fmtMoney(bet),
    fmtMoney(win),
    fmtMoney(after),
    String(before),
    String(bet),
    String(win),
    String(after),
    apiField(row, 'isFreeSpin') ? 'free' : 'paid',
  ], q);
}

function clearUserGameplaySpinsUi(message, loading = false) {
  userGameplaySpinsData = [];
  userGameplaySpinsMeta = emptySpinsMeta();
  setUserGameplayStatus(message || UGP_SPINS_HINT);
  show($('userGameplaySpinsSearchWrap'), false);
  setInputValue('userGameplaySpinsSearch', '');
  setHtml('userGameplaySpinsPager', '');
  resetTableWrap('userGameplaySpinsWrap', loading);
  setHtml('ugpSpinsChart', '');
  setTabRowCount('spins', []);
}

function userGameplaySpinsTotalPages() {
  const pageSize = Number(userGameplaySpinsMeta.pageSize || UGP_SPINS_PAGE_SIZE);
  return pageCount(Number(userGameplaySpinsMeta.totalCount || 0), pageSize);
}

function renderUserGameplaySpinsPager() {
  const total = Number(userGameplaySpinsMeta.totalCount || 0);
  setHtml('userGameplaySpinsPager', !total && !userGameplaySpinsData.length ? '' : renderPagerHtml({
    dataAttr: 'data-ugp-spins-page',
    page: Number(userGameplaySpinsMeta.page || 1),
    pageSize: Number(userGameplaySpinsMeta.pageSize || UGP_SPINS_PAGE_SIZE),
    total,
    totalPages: userGameplaySpinsTotalPages(),
  }));
}

function spinJsonButton(r) {
  const hasJson = spinHasJson(r);
  // Stable index into userGameplaySpinsData so the modal can find the row (and its demo JSON).
  const sourceIndex = userGameplaySpinsData.indexOf(r);
  return '<button type="button" class="icon-btn json-btn" data-ugp-spin-json="' + escAttr(apiField(r, 'id', '')) +
    '" data-ugp-spin-idx="' + escAttr(String(sourceIndex)) + '"' +
    (hasJson ? '' : ' disabled') +
    ' data-tip="' + (hasJson ? 'Open spin response JSON' : 'No response_json for this spin') +
    '" aria-label="Open spin JSON">i</button>';
}

const UGP_SPIN_COLUMNS = sortableColumns([
  { label: 'Created', render: (r) => renderTimezoneDateHtml(apiField(r, 'createdAt', '')) },
  { label: 'Game', render: (r) => '<span class="cell-game">' + escHtml(apiField(r, 'gameName', '')) + '</span>' },
  { label: 'Spin #', align: 'right', render: (r) => fmtInt(apiField(r, 'spinIndex', 0)) },
  { label: 'Balance Before', align: 'right', render: (r) => moneyHtml(apiField(r, 'balanceBefore', 0)) },
  { label: 'Bet', align: 'right', render: (r) => moneyHtml(apiField(r, 'betAmount', 0), 'bet') },
  {
    label: 'Win',
    align: 'right',
    render: (r) => {
      const win = Number(apiField(r, 'winAmount', 0));
      return moneyHtml(win, win > 0 ? 'up' : win === 0 ? 'flat' : 'down');
    },
  },
  {
    label: 'Balance After',
    align: 'right',
    render: (r) => {
      const after = apiField(r, 'balanceAfter', 0);
      return moneyHtml(after, Number(after) >= Number(apiField(r, 'balanceBefore', 0)) ? 'up' : 'down');
    },
  },
  { label: 'Type', render: (r) => apiField(r, 'isFreeSpin') ? badgeHtml('Free', 'purple') : badgeHtml('Paid', 'info') },
  { label: 'JSON', align: 'center', render: spinJsonButton },
], {
  'Created': (r) => utcMillis(apiField(r, 'createdAt', '')) || 0,
  'Spin #': 'spinIndex',
  'Bet': 'betAmount',
  'Win': 'winAmount',
  'Balance After': 'balanceAfter',
});

function renderUserGameplaySpinsTable() {
  const search = $('userGameplaySpinsSearch')?.value || '';
  const query = String(search).trim();
  const filtered = userGameplaySpinsData.filter((r) => matchesUserGameplaySpinsSearch(r, search));
  const pageRows = userGameplaySpinsData.length;
  const label = userLabel(userGameplaySpinsMeta);

  renderUgpSpinsChart(filtered);
  renderTable(
    'userGameplaySpinsWrap',
    filtered,
    UGP_SPIN_COLUMNS,
    pageRows ? 'No spins match "' + query + '" on this page.' : 'No spin rows.',
    // Server-paged: sorting applies within the loaded page, the API pager stays in charge of pages.
    { explore: 'userGameplaySpinsWrap', rerender: renderUserGameplaySpinsTable, pageSize: Infinity }
  );
  setTabRowCount('spins', filtered);

  if (label && pageRows) {
    const total = Number(userGameplaySpinsMeta.totalCount || 0);
    setUserGameplayStatus(query
      ? 'Results for ' + label + ' · ' + filtered.length + ' of ' + pageRows + ' on this page (total ' + total + ')'
      : 'Results for ' + label + ' · page ' + userGameplaySpinsMeta.page + ' · ' + countLabel(total, 'spin'));
  }
}

function renderUserGameplaySpins(data) {
  const items = data?.items || data?.Items || [];
  const userId = data?.userId || data?.UserId || '';
  const userName = data?.userName || data?.UserName || '';
  userGameplaySpinsData = items;
  userGameplaySpinsMeta = {
    userId: String(userId),
    userName: String(userName || ''),
    page: Number(apiField(data, 'page', 1)),
    pageSize: Number(apiField(data, 'pageSize', UGP_SPINS_PAGE_SIZE)),
    totalCount: Number(apiField(data, 'totalCount', items.length)),
  };

  show($('userGameplaySpinsSearchWrap'), items.length > 0 || userGameplaySpinsMeta.totalCount > 0);
  renderUserGameplaySpinsPager();
  renderUserGameplaySpinsTable();
}

async function fetchUserGameplaySpins(userId, from, to, page, pageSize, gameId) {
  if (isDemoMode()) return getDemoUserGameplaySpins(userId, from, gameId);

  const params = new URLSearchParams();
  params.set('userId', userId);
  params.set('page', String(page || 1));
  params.set('pageSize', String(pageSize || UGP_SPINS_PAGE_SIZE));
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (gameId) params.set('gameId', gameId);
  return fetchUserGameplayJson('/spins?' + params.toString());
}

/** Status suffix describing an active game / date filter, e.g. "Mermaid · 2026-07-23". */
function spinsFilterDescription(gameName, gameId, from, to) {
  const bits = [];
  if (gameName) bits.push(gameName);
  else if (gameId) bits.push('game ' + gameId);
  if (from && to && from === to) bits.push(from);
  else if (from || to) bits.push((from || '…') + ' → ' + (to || '…'));
  return bits.join(' · ');
}

async function lookupUserGameplaySpins(opts = {}) {
  const userId = readGuidUserId('userGameplaySpinsUserId', clearUserGameplaySpinsUi);
  if (!userId) {
    cancelLookup('spins');
    return;
  }
  const token = nextLookupToken('spins');

  const from = opts.from != null ? opts.from : ($('userGameplaySpinsFrom')?.value || '');
  const to = opts.to != null ? opts.to : ($('userGameplaySpinsTo')?.value || '');
  const gameId = opts.gameId != null ? opts.gameId : (($('userGameplaySpinsGameId')?.value || '').trim());
  const page = Math.max(1, Number(opts.page || userGameplaySpinsMeta.page || 1));
  const pageSize = Number(userGameplaySpinsMeta.pageSize || UGP_SPINS_PAGE_SIZE);
  const btn = $('userGameplaySpinsLookupBtn');
  const wrap = $('userGameplaySpinsWrap');
  if (btn) btn.disabled = true;
  userGameplaySpinsLoading = true;
  if (opts.silent) wrap?.classList.add('is-loading');
  try {
    if (!opts.silent) {
      const label = gameId ? (userId + ' · game ' + gameId) : userId;
      clearUserGameplaySpinsUi('Looking up spins for ' + label + '…', true);
    }
    const data = await fetchUserGameplaySpins(userId, from, to, page, pageSize, gameId);
    if (!isLatestLookup('spins', token)) return;
    renderUserGameplaySpins(data);
    const filterText = (opts.gameName || from || gameId) ? spinsFilterDescription(opts.gameName, gameId, from, to) : '';
    if (filterText) {
      setUserGameplayStatus(($('userGameplayStatus')?.textContent || 'Results') + ' · filter: ' + filterText);
    }
    if (opts.silent && wrap) wrap.scrollTop = 0;
  } catch (err) {
    if (!isLatestLookup('spins', token)) return;
    const message = 'Lookup failed: ' + (err?.message || String(err));
    clearUserGameplaySpinsUi(message);
    setHtml('userGameplaySpinsWrap', errorHtml(message));
  } finally {
    if (isLatestLookup('spins', token)) {
      userGameplaySpinsLoading = false;
      wrap?.classList.remove('is-loading');
      if (btn) btn.disabled = false;
    }
  }
}

function handleUserGameplaySpinsPagerClick(e) {
  const btn = e.target.closest('[data-ugp-spins-page]');
  if (!btn || btn.disabled || userGameplaySpinsLoading) return;
  const page = Number(userGameplaySpinsMeta.page || 1);
  const totalPages = userGameplaySpinsTotalPages();
  const targets = {
    first: 1,
    prev: Math.max(1, page - 1),
    next: Math.min(totalPages, page + 1),
    last: totalPages,
  };
  const next = targets[btn.getAttribute('data-ugp-spins-page') || ''] ?? page;
  if (next === page) return;
  lookupUserGameplaySpins({ page: next, silent: true });
}

// ---- Events ----

function onEnter(id, handler) {
  $(id)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handler();
    }
  });
}

function clearInputs(ids) {
  ids.forEach((id) => setInputValue(id, ''));
}

function bindUserGameplayEvents() {
  $('userGameplayLookupBtn')?.addEventListener('click', () => lookupUserGameplay());
  $('userGameplayClearBtn')?.addEventListener('click', () => {
    cancelLookup('summary');
    clearInputs(['userGameplayName', 'userGameplaySearch']);
    clearUserGameplayUi();
  });
  onEnter('userGameplayName', lookupUserGameplay);
  $('userGameplaySearch')?.addEventListener('input', () => renderUserGameplayGamesTable());
  document.querySelectorAll('.user-gameplay-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => setUserGameplayTab(btn.dataset.ugpTab || 'summary'));
  });

  $('userGameplayDailyLookupBtn')?.addEventListener('click', () => lookupUserGameplayDaily());
  $('userGameplayDailyClearBtn')?.addEventListener('click', () => {
    cancelLookup('daily');
    clearInputs(['userGameplayUserId', 'userGameplayDailyFrom', 'userGameplayDailyTo', 'userGameplayDailySearch']);
    clearUserGameplayDailyUi();
  });
  onEnter('userGameplayUserId', lookupUserGameplayDaily);
  $('userGameplayDailySearch')?.addEventListener('input', () => renderUserGameplayDailyTable());
  $('userGameplayDailyWrap')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ugp-daily-spins]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    openDailyRowSpins(
      btn.getAttribute('data-game-id') || '',
      btn.getAttribute('data-date') || '',
      btn.getAttribute('data-game-name') || ''
    );
  });

  const lookupFirstSpinsPage = () => lookupUserGameplaySpins({ page: 1 });
  $('userGameplaySpinsLookupBtn')?.addEventListener('click', lookupFirstSpinsPage);
  $('userGameplaySpinsClearBtn')?.addEventListener('click', () => {
    cancelLookup('spins');
    clearInputs([
      'userGameplaySpinsUserId',
      'userGameplaySpinsFrom',
      'userGameplaySpinsTo',
      'userGameplaySpinsGameId',
      'userGameplaySpinsSearch',
    ]);
    clearUserGameplaySpinsUi();
  });
  ['userGameplaySpinsUserId', 'userGameplaySpinsFrom', 'userGameplaySpinsTo', 'userGameplaySpinsGameId']
    .forEach((id) => onEnter(id, lookupFirstSpinsPage));
  $('userGameplaySpinsSearch')?.addEventListener('input', () => renderUserGameplaySpinsTable());
  $('userGameplaySpinsPager')?.addEventListener('click', handleUserGameplaySpinsPagerClick);
  $('userGameplaySpinsWrap')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ugp-spin-json]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    openSpinJsonFromTable(btn.getAttribute('data-ugp-spin-json') || '', btn.getAttribute('data-ugp-spin-idx') || '0');
  });
}
