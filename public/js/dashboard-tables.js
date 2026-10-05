// Home dashboard tables: RTP tables, Game Target RTP and User Feedbacks.

// ---- Game title / target RTP helpers ----

// Game title / live status / target-RTP helpers for the dashboard tables.

const STANDARD_TARGET_RTP_PERCENTS = [60, 70, 80];

const GAME_TITLE_FILTER_LABELS = {
  'none': 'None',
  'coming soon': 'Coming Soon',
  'new': 'New',
  'hot': 'Hot',
  'trending': 'Trending',
};

const GAME_TITLE_BADGE_TONES = new Map([
  ['none', 'flat'],
  ['hot', 'warn'],
  ['new', 'up'],
  ['trending', 'purple'],
  ['coming soon', 'flat'],
]);

/** Keep the previous selection when it still exists, otherwise fall back to "all". */
function restoreSelectValue(el, previous) {
  const stillValid = Array.from(el.options).some((o) => o.value === previous);
  el.value = stillValid ? previous : 'all';
}

function targetRtpToPercent(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  // Targets are usually 0.6–0.8 (ratio) or sometimes already 60–80.
  return n <= 1 ? n * 100 : n;
}

function matchesTargetRtpFilter(targetRtp, filter) {
  if (filter === 'all') return true;
  const pct = targetRtpToPercent(targetRtp);
  const want = Number(filter);
  if (pct == null || Number.isNaN(want)) return false;
  return Math.round(pct) === Math.round(want);
}

function filterByTargetRtp(rows, filter) {
  if (!Array.isArray(rows)) return [];
  if (!filter || filter === 'all') return rows;
  return rows.filter((r) => matchesTargetRtpFilter(r.targetRtp, filter));
}

function filterByMinRtp(rows, filter) {
  if (!Array.isArray(rows)) return [];
  if (!filter || filter === 'all') return rows;
  const minPct = Number(filter);
  if (Number.isNaN(minPct)) return rows;
  return rows.filter((r) => {
    return rowRtp(r) * 100 >= minPct;
  });
}

function uniqueTargetRtpPercents(rows) {
  const set = new Set();
  for (const row of rows || []) {
    const pct = targetRtpToPercent(row.targetRtp);
    if (pct != null) set.add(Math.round(pct));
  }
  return Array.from(set).sort((a, b) => a - b);
}

/** Always offer the standard targets, plus any other targets present in the data. */
function populateTargetRtpSelect(selectId, rows) {
  const el = $(selectId);
  if (!el) return;
  const previous = el.value || 'all';
  const percents = Array.from(new Set([...STANDARD_TARGET_RTP_PERCENTS, ...uniqueTargetRtpPercents(rows)]))
    .sort((a, b) => a - b);
  setHtml(el, '<option value="all">All</option>' + percents
    .map((p) => '<option value="' + p + '">' + p + '%</option>')
    .join(''));
  restoreSelectValue(el, previous);
}

function normalizeGameTargetRtpRow(row) {
  return {
    gameId: apiField(row, 'gameId', ''),
    gameName: apiField(row, 'gameName', ''),
    title: apiField(row, 'title', ''),
    targetRtp: apiField(row, 'targetRtp', 0),
  };
}

function getGameTitle(row) {
  return apiField(row, 'title', '');
}

function normalizeGameTitle(value) {
  let t = String(value ?? '').trim().toLowerCase();
  if (!t || t === 'none' || t === 'null' || t === '-' || t === 'n/a') return 'none';
  t = t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (t === 'comingsoon' || t === 'coming-soon' || t === 'coming soon') return 'coming soon';
  return t;
}

function formatGameTitleLabel(value) {
  const norm = normalizeGameTitle(value);
  if (GAME_TITLE_FILTER_LABELS[norm]) return GAME_TITLE_FILTER_LABELS[norm];
  return norm.split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function isGameLive(row) {
  return normalizeGameTitle(getGameTitle(row)) !== 'coming soon';
}

function countGameLiveStatus(rows) {
  let live = 0;
  let notLive = 0;
  for (const row of rows || []) {
    if (isGameLive(row)) live++;
    else notLive++;
  }
  return { live, notLive };
}

function matchesGameTitleFilter(row, filter) {
  if (!filter || filter === 'all') return true;
  return normalizeGameTitle(getGameTitle(row)) === filter;
}

function matchesGameLiveFilter(row, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'live') return isGameLive(row);
  if (filter === 'not-live') return !isGameLive(row);
  return true;
}

/** Title filter options with counts: known titles first (fixed order), then any others. */
function populateGameTitleFilter(rows) {
  const el = $('targetGameTitleFilter');
  if (!el) return;
  const previous = el.value || 'all';
  const list = Array.isArray(rows) ? rows : [];
  const counts = new Map();
  for (const row of list) {
    const norm = normalizeGameTitle(getGameTitle(row));
    counts.set(norm, (counts.get(norm) || 0) + 1);
  }

  const knownKeys = Object.keys(GAME_TITLE_FILTER_LABELS);
  let html = '<option value="all">All (' + fmtInt(list.length) + ')</option>';
  for (const key of knownKeys) {
    const count = counts.get(key) || 0;
    if (count > 0) {
      html += '<option value="' + escAttr(key) + '">' + escHtml(GAME_TITLE_FILTER_LABELS[key]) + ' (' + fmtInt(count) + ')</option>';
    }
  }
  for (const [key, count] of counts) {
    if (knownKeys.includes(key)) continue;
    html += '<option value="' + escAttr(key) + '">' + escHtml(formatGameTitleLabel(key)) + ' (' + fmtInt(count) + ')</option>';
  }

  setHtml(el, html);
  restoreSelectValue(el, previous);
}

function populateGameLiveFilter(rows) {
  const el = $('targetGameLiveFilter');
  if (!el) return;
  const previous = el.value || 'all';
  const list = Array.isArray(rows) ? rows : [];
  const { live, notLive } = countGameLiveStatus(list);
  let html = '<option value="all">All (' + fmtInt(list.length) + ')</option>';
  if (live > 0) html += '<option value="live">Live (' + fmtInt(live) + ')</option>';
  if (notLive > 0) html += '<option value="not-live">Not live (' + fmtInt(notLive) + ')</option>';
  setHtml(el, html);
  restoreSelectValue(el, previous);
}

function renderGameTitleBadge(value) {
  return badgeHtml(formatGameTitleLabel(value), GAME_TITLE_BADGE_TONES.get(normalizeGameTitle(value)) || 'info');
}

function renderGameLiveBadge(row) {
  return isGameLive(row) ? badgeHtml('Live', 'up') : badgeHtml('Not live', 'warn');
}

// ---- RTP tables ----

// Home dashboard RTP tables (by game, by user, above target, users ≥ 100%) and Game Target RTP.

const SEARCH_DEBOUNCE_MS = 160;

/** Rows are replaced on every summary render (see renderDashboard). */
const rtpTables = {
  rtpByGame: {
    kind: 'game', rows: [], wrapId: 'rtpByGameWrap', countId: 'countRtpGame',
    sectionId: 'sec-rtp-game', filterId: 'rtpByGameTargetFilter', searchId: 'rtpByGameSearch',
    statusFilterId: 'rtpByGameStatusFilter',
  },
  rtpByUser: {
    kind: 'user', rows: [], wrapId: 'rtpByUserWrap', countId: 'countRtpUser',
    sectionId: 'sec-rtp-user', filterId: 'rtpByUserMinFilter', searchId: 'rtpByUserSearch',
  },
  gamesAboveTarget: {
    kind: 'game', rows: [], wrapId: 'gamesAboveTargetWrap', countId: 'countAboveTarget',
    sectionId: 'sec-above-target', filterId: 'gamesAboveTargetFilter', searchId: 'gamesAboveTargetSearch',
  },
  usersRtpHigh: {
    kind: 'user', rows: [], wrapId: 'usersRtpHighWrap', countId: 'countUsersHigh',
    sectionId: 'sec-users-high', filterId: 'usersHighMinFilter', searchId: 'usersHighSearch',
  },
};

const GAME_TARGET_FILTER_IDS = ['targetRtpFilter', 'targetGameTitleFilter', 'targetGameLiveFilter'];

let gamesTargetRtpData = [];

function emptyFilterMessage(kind, filterValue) {
  if (!filterValue || filterValue === 'all') return 'No data.';
  if (kind === 'target') return 'No rows with Target RTP ' + filterValue + '%. Try All or another option.';
  if (kind === 'title') return 'No games with title "' + formatGameTitleLabel(filterValue) + '". Try All or another option.';
  if (kind === 'live') return filterValue === 'live'
    ? 'No live games match your filters. Try All or Not live.'
    : 'No not-live games match your filters. Try All or Live.';
  if (kind === 'minRtp') return 'No rows with RTP ≥ ' + filterValue + '%. Try All or a lower option.';
  return 'No data.';
}

function holdHtml(r) {
  const hold = rowHold(r);
  return valHtml((hold < 0 ? '−$' : '$') + fmtMoney(Math.abs(hold)), hold >= 0 ? 'up' : 'down');
}

function vsTargetHtml(r) {
  const pp = rtpVsTarget(r);
  if (isAboveTarget(r)) return badgeHtml('Above · ' + fmtPp(pp), 'warn');
  return Math.round(pp * 10) >= 0 ? badgeHtml('At target · ' + fmtPp(pp), 'flat') : badgeHtml('Below · ' + fmtPp(pp), 'up');
}

const GAME_RTP_COLUMNS = [
  { label: 'Game', sort: (r) => String(r.gameName || ''), render: (r) => '<span class="cell-game">' + escHtml(r.gameName) + '</span>' },
  { label: 'Total Bet', align: 'right', sort: (r) => Number(r.totalBet), render: (r) => moneyHtml(r.totalBet, 'bet') },
  { label: 'Total Win', align: 'right', sort: (r) => Number(r.totalWin), render: (r) => moneyHtml(r.totalWin, 'up') },
  { label: 'Hold', align: 'right', sort: rowHold, render: holdHtml },
  { label: 'Spins', align: 'right', sort: (r) => Number(r.totalSpin), render: (r) => fmtInt(r.totalSpin) },
  { label: 'RTP', align: 'right', sort: rowRtp, render: (r) => rtpBar(rowRtp(r), isAboveTarget(r)) },
  { label: 'Target', align: 'right', sort: (r) => Number(r.targetRtp), render: (r) => badgeHtml(fmtRtp(r.targetRtp)) },
  { label: 'vs Target', sort: rtpVsTarget, sortDir: -1, render: vsTargetHtml },
  {
    label: 'Drill',
    align: 'center',
    className: 'col-action',
    render: (r) => graphIconButton('game', r.gameId, Number(r.totalSpin) > 0 && !!r.gameId, 'View game users and sessions'),
  },
];

const USER_RTP_COLUMNS = [
  { label: 'Username', sort: (r) => String(r.username || ''), render: (r) => '<span class="cell-user">' + escHtml(r.username) + '</span>' },
  { label: 'Total Bet', align: 'right', sort: (r) => Number(r.totalBet), render: (r) => moneyHtml(r.totalBet, 'bet') },
  { label: 'Total Win', align: 'right', sort: (r) => Number(r.totalWin), render: (r) => moneyHtml(r.totalWin, 'up') },
  { label: 'Hold', align: 'right', sort: rowHold, render: holdHtml },
  { label: 'Spins', align: 'right', sort: (r) => Number(r.totalSpin), render: (r) => fmtInt(r.totalSpin) },
  { label: 'RTP', align: 'right', sort: rowRtp, render: (r) => rtpBar(rowRtp(r), rowRtp(r) >= 1) },
  {
    label: 'Drill',
    align: 'center',
    className: 'col-action',
    render: (r) => graphIconButton('user', r.userId, Number(r.totalSpin) > 0 && !!r.userId, 'View user sessions'),
  },
];

/** Search by name, spin count, or RTP percent (e.g. "95", "95.5", "95%"). */
function matchesRtpRowSearch(row, nameKey, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;

  if (String(row[nameKey] || '').toLowerCase().includes(q)) return true;
  if (String(row.totalSpin ?? '').includes(q)) return true;

  const rtpPct = rowRtp(row) * 100;
  const pctFixed = rtpPct.toFixed(2);
  return matchesAnyText([
    pctFixed,
    String(Math.round(rtpPct * 100) / 100),
    String(rtpPct),
    pctFixed + '%',
    Math.round(rtpPct) + '%',
    Math.round(rtpPct).toString(),
  ], q);
}

const TARGET_STATUS_LABELS = { above: 'above', below: 'at/below' };

function matchesTargetStatus(row, status) {
  if (!status || status === 'all') return true;
  return status === 'above' ? isAboveTarget(row) : !isAboveTarget(row);
}

function filterGameRtpRows(rows, targetFilter, searchQuery, status = 'all') {
  return filterByTargetRtp(rows, targetFilter)
    .filter((r) => matchesTargetStatus(r, status) && matchesRtpRowSearch(r, 'gameName', searchQuery));
}

function filterUserRtpRows(rows, minFilter, searchQuery) {
  return filterByMinRtp(rows, minFilter).filter((r) => matchesRtpRowSearch(r, 'username', searchQuery));
}

function rtpTableFilterValues(table) {
  return {
    filter: $(table.filterId)?.value || 'all',
    search: $(table.searchId)?.value || '',
    status: table.statusFilterId ? ($(table.statusFilterId)?.value || 'all') : 'all',
  };
}

function getFilteredRtpRows(table) {
  const { filter, search, status } = rtpTableFilterValues(table);
  return table.kind === 'game'
    ? filterGameRtpRows(table.rows, filter, search, status)
    : filterUserRtpRows(table.rows, filter, search);
}

/** Counts update for every tab; table HTML is only built for the tab that is visible. */
function renderRtpTable(table) {
  const values = rtpTableFilterValues(table);
  const filtered = getFilteredRtpRows(table);
  const isGame = table.kind === 'game';
    setRowCount(table.countId, filtered);
    updateSectionNavCount(table.sectionId, filtered.length);
  if (!isExplorerSectionActive(table.sectionId)) return;
  const emptyMsg = values.status !== 'all' && values.filter === 'all' && !values.search
    ? 'No games ' + TARGET_STATUS_LABELS[values.status] + ' target RTP.'
    : emptyFilterMessage(isGame ? 'target' : 'minRtp', values.filter);
  renderTable(table.wrapId, filtered, isGame ? GAME_RTP_COLUMNS : USER_RTP_COLUMNS, emptyMsg, {
    explore: table.wrapId,
    rerender: () => renderRtpTable(table),
    resetKey: values.filter + '|' + values.search + '|' + values.status,
  });
}

function filterGamesTargetRtp(rows) {
  const rtpFilter = $('targetRtpFilter')?.value || 'all';
  const titleFilter = $('targetGameTitleFilter')?.value || 'all';
  const liveFilter = $('targetGameLiveFilter')?.value || 'all';
  return filterByTargetRtp(rows, rtpFilter)
    .filter((r) => matchesGameTitleFilter(r, titleFilter))
    .filter((r) => matchesGameLiveFilter(r, liveFilter));
}

function setTargetRtpLiveCounts(rows) {
  const { live, notLive } = countGameLiveStatus(rows);
  setText('countTargetRtpLive', fmtInt(live) + ' live');
  setText('countTargetRtpNotLive', fmtInt(notLive) + ' not live');
}

const GAME_TARGET_RTP_COLUMNS = [
  { label: 'Game', sort: (r) => String(r.gameName || ''), render: (r) => '<span class="cell-game">' + escHtml(r.gameName) + '</span>' },
  { label: 'Title', sort: (r) => formatGameTitleLabel(getGameTitle(r)), render: (r) => renderGameTitleBadge(getGameTitle(r)) },
  { label: 'Live', sort: (r) => (isGameLive(r) ? 1 : 0), render: (r) => renderGameLiveBadge(r) },
  { label: 'Target RTP', align: 'right', sort: (r) => Number(r.targetRtp), render: (r) => valHtml(fmtRtp(r.targetRtp)) },
];

function renderGamesTargetRtpTable() {
  const rtpFilter = $('targetRtpFilter')?.value || 'all';
  const titleFilter = $('targetGameTitleFilter')?.value || 'all';
  const liveFilter = $('targetGameLiveFilter')?.value || 'all';
  const filtered = filterGamesTargetRtp(gamesTargetRtpData);
  setRowCount('countTargetRtp', filtered);
  setTargetRtpLiveCounts(filtered);
  updateSectionNavCount('sec-target-rtp', filtered.length);
  if (!isExplorerSectionActive('sec-target-rtp')) return;

  let emptyMsg = 'No data.';
  if (liveFilter !== 'all') emptyMsg = emptyFilterMessage('live', liveFilter);
  else if (titleFilter !== 'all') emptyMsg = emptyFilterMessage('title', titleFilter);
  else if (rtpFilter !== 'all') emptyMsg = emptyFilterMessage('target', rtpFilter);
  renderTable('gamesTargetRtpWrap', filtered, GAME_TARGET_RTP_COLUMNS, emptyMsg, {
    explore: 'gamesTargetRtpWrap',
    rerender: renderGamesTargetRtpTable,
    resetKey: rtpFilter + '|' + titleFilter + '|' + liveFilter,
  });
}

function renderAllRtpTables() {
  for (const table of Object.values(rtpTables)) renderRtpTable(table);
  renderGamesTargetRtpTable();
}

/** Renders one explorer tab (used when a tab becomes visible). */
const EXPLORER_RENDERERS = {
  'sec-rtp-game': () => renderRtpTable(rtpTables.rtpByGame),
  'sec-rtp-user': () => renderRtpTable(rtpTables.rtpByUser),
  'sec-above-target': () => renderRtpTable(rtpTables.gamesAboveTarget),
  'sec-users-high': () => renderRtpTable(rtpTables.usersRtpHigh),
  'sec-feedbacks': () => renderUserFeedbacksTable(),
  'sec-target-rtp': () => renderGamesTargetRtpTable(),
  'sec-spin-wheel': () => showRewardRecords('sec-spin-wheel'),
  'sec-daily-rewards': () => showRewardRecords('sec-daily-rewards'),
};

function bindRtpTableEvents() {
  for (const table of Object.values(rtpTables)) {
    const render = () => renderRtpTable(table);
    // Some browsers only fire `input` reliably for selects in certain cases, so listen to both.
    for (const id of [table.filterId, table.statusFilterId].filter(Boolean)) {
      $(id).addEventListener('change', render);
      $(id).addEventListener('input', render);
    }

    let searchTimer = null;
    $(table.searchId).addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(render, SEARCH_DEBOUNCE_MS);
    });
    $(table.searchId).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      window.clearTimeout(searchTimer);
      render();
    });
  }

  for (const id of GAME_TARGET_FILTER_IDS) {
    $(id).addEventListener('change', () => renderGamesTargetRtpTable());
    $(id).addEventListener('input', () => renderGamesTargetRtpTable());
  }
}

// ---- User Feedbacks ----

// User Feedbacks table with date-range and star filters.

/** Ratings at or below this count as "low" (star filter value 'low', attention alert). */
const LOW_RATING_MAX = 2;

let userFeedbacksData = [];
/** Applied filter values (yyyy-mm-dd or ''; star '1'–'5', 'low' or 'all'). */
const feedbackFilter = { from: '', to: '', star: 'all' };
/** Visible (filtered + sorted) feedbacks per user row; reset whenever data or filters change. */
let visibleFeedbacksCache = new WeakMap();

function setUserFeedbacksData(rows) {
  userFeedbacksData = rows;
  visibleFeedbacksCache = new WeakMap();
  renderUserFeedbacksTable();
}

/** API field renamed: feedback (new) / message (demo & older payloads). */
function feedbackText(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const text = entry.feedback ?? entry.message;
  return text == null ? '' : String(text).trim();
}

function getUserFeedbacksList(userRow) {
  if (Array.isArray(userRow.feedbacks) && userRow.feedbacks.length) {
    return userRow.feedbacks;
  }
  if (Array.isArray(userRow.feedbackMessages) && userRow.feedbackMessages.length) {
    return userRow.feedbackMessages.map((message) => ({
      ratingStar: null,
      message,
      feedback: message,
      createdAt: userRow.feedbackDate ?? userRow.createdAt ?? userRow.lastFeedbackDate ?? userRow.date,
    }));
  }
  return [];
}

/** Newest first; entries without a valid date go last. */
function sortFeedbacksByDate(items) {
  return [...items].sort((a, b) => compareUtcDesc(a.createdAt, b.createdAt));
}

/** From/To are calendar days in the display time zone. */
function filterFeedbacksByDate(feedbacks) {
  if (!Array.isArray(feedbacks)) return [];
  if (!feedbackFilter.from && !feedbackFilter.to) return feedbacks;
  return feedbacks.filter((f) => isWithinDayRange(f.createdAt, feedbackFilter.from, feedbackFilter.to));
}

function filterFeedbacksByStar(feedbacks) {
  if (!Array.isArray(feedbacks)) return [];
  if (!feedbackFilter.star || feedbackFilter.star === 'all') return feedbacks;
  if (feedbackFilter.star === 'low') return feedbacks.filter((f) => f.ratingStar != null && Number(f.ratingStar) <= LOW_RATING_MAX);
  const target = Number(feedbackFilter.star);
  if (Number.isNaN(target)) return feedbacks;
  return feedbacks.filter((f) => Number(f.ratingStar) === target);
}

function getVisibleFeedbacksForUser(userRow) {
  let visible = visibleFeedbacksCache.get(userRow);
  if (!visible) {
    visible = sortFeedbacksByDate(filterFeedbacksByStar(filterFeedbacksByDate(getUserFeedbacksList(userRow))));
    visibleFeedbacksCache.set(userRow, visible);
  }
  return visible;
}

function setDefaultFeedbackDateFilter() {
  const today = toDateInputValue();
  feedbackFilter.from = today;
  feedbackFilter.to = today;
  setInputValue('feedbackDateFrom', today);
  setInputValue('feedbackDateTo', today);
}

function formatFilterDateLabel(isoDate) {
  return isoDate ? formatDayLabel(isoDate) : '…';
}

function updateFeedbackFilterHint() {
  const hint = $('feedbackFilterHint');
  if (!hint) return;
  const parts = [];
  if (!feedbackFilter.from && !feedbackFilter.to) {
    parts.push('all dates');
  } else {
    const from = formatFilterDateLabel(feedbackFilter.from);
    const to = formatFilterDateLabel(feedbackFilter.to);
    parts.push(feedbackFilter.from && feedbackFilter.from === feedbackFilter.to ? from + ' only' : from + ' – ' + to);
  }
  if (feedbackFilter.star && feedbackFilter.star !== 'all') {
    parts.push(feedbackFilter.star === 'low' ? '≤ ' + LOW_RATING_MAX + ' ★' : feedbackFilter.star + ' ★');
  }
  hint.textContent = 'Showing ' + parts.join(' · ');
}

/** One value renders inline; several render as a list. */
function listOrSingleHtml(items, className, renderItem) {
  if (items.length === 1) return renderItem(items[0]);
  return '<ul class="' + className + '">' + items.map((item) => '<li>' + renderItem(item) + '</li>').join('') + '</ul>';
}

function feedbackDatesCell(userRow) {
  const items = getVisibleFeedbacksForUser(userRow);
  if (!items.length) return EMPTY_CELL_HTML;
  return listOrSingleHtml(items, 'feedback-dates', (f) => renderTimezoneDateHtml(f.createdAt));
}

function feedbackStarsCell(userRow) {
  const stars = getVisibleFeedbacksForUser(userRow)
    .filter((f) => f.ratingStar != null)
    .map((f) => Number(f.ratingStar));
  if (!stars.length) return EMPTY_CELL_HTML;
  return listOrSingleHtml(stars, 'feedback-dates', ratingBadge);
}

function visibleFeedbackStars(userRow) {
  return getVisibleFeedbacksForUser(userRow)
    .map((f) => Number(f.ratingStar))
    .filter((n) => !Number.isNaN(n));
}

function feedbackAvgRatingCell(userRow) {
  const stars = visibleFeedbackStars(userRow);
  return ratingBadge(stars.length ? average(stars) : userRow.avgRating);
}

function feedbackMessagesCell(userRow) {
  const messages = getVisibleFeedbacksForUser(userRow).map((f) => feedbackText(f)).filter(Boolean);
  if (!messages.length) return EMPTY_CELL_HTML;
  return '<ul class="feedback-messages">' + messages.map((m) => '<li>' + escHtml(m) + '</li>').join('') + '</ul>';
}

function filterUserFeedbacks(rows) {
  if (!Array.isArray(rows)) return [];
  const hasDate = !!(feedbackFilter.from || feedbackFilter.to);
  const hasStar = !!(feedbackFilter.star && feedbackFilter.star !== 'all');
  if (!hasDate && !hasStar) return rows.slice();
  return rows.filter((r) => getVisibleFeedbacksForUser(r).length > 0);
}

function updateFeedbackHeaderStats(filteredUsers) {
  const avgEl = $('feedbackFilteredAvgRating');
  if (!avgEl) return;
  const stars = filteredUsers.flatMap(visibleFeedbackStars);
  setHtml(avgEl, stars.length ? 'Avg ' + ratingBadge(average(stars)) : 'Avg —');
}

function applyFeedbackDateFilter() {
  feedbackFilter.from = $('feedbackDateFrom')?.value || '';
  feedbackFilter.to = $('feedbackDateTo')?.value || '';
  feedbackFilter.star = $('feedbackStarFilter')?.value || 'all';
  visibleFeedbacksCache = new WeakMap();
  renderUserFeedbacksTable();
}

/** Set the inputs and apply in one step (Clear button, attention alerts). */
function setFeedbackFilter({ from = '', to = '', star = 'all' } = {}) {
  setInputValue('feedbackDateFrom', from);
  setInputValue('feedbackDateTo', to);
  setInputValue('feedbackStarFilter', star);
  applyFeedbackDateFilter();
}

function clearFeedbackDateFilter() {
  setFeedbackFilter();
}

function latestVisibleFeedbackMillis(userRow) {
  return utcMillis(getVisibleFeedbacksForUser(userRow)[0]?.createdAt) || 0;
}

const FEEDBACK_COLUMNS = [
  { label: 'Date', sort: latestVisibleFeedbackMillis, sortDir: -1, render: (r) => feedbackDatesCell(r) },
    {
      label: 'Username',
    sort: (r) => String(r.username || ''),
      render: (r) => r.username ? '<span class="cell-user">' + escHtml(r.username) + '</span>' : EMPTY_CELL_HTML,
    },
    {
      label: 'User ID',
      render: (r) => r.userId
        ? '<span class="cell-id user-id" title="' + escAttr(r.userId) + '">' + escHtml(r.userId) + '</span>'
        : EMPTY_CELL_HTML,
    },
  {
    label: 'Count',
    align: 'right',
    sort: (r) => getVisibleFeedbacksForUser(r).length || Number(r.feedBackCount || 0),
    render: (r) => fmtInt(getVisibleFeedbacksForUser(r).length || r.feedBackCount),
  },
  {
    label: 'Avg',
    sort: (r) => { const s = visibleFeedbackStars(r); return s.length ? average(s) : Number(r.avgRating || 0); },
    sortDir: 1,
    render: (r) => feedbackAvgRatingCell(r),
  },
    { label: 'Ratings', render: (r) => feedbackStarsCell(r) },
    { label: 'Messages', render: (r) => feedbackMessagesCell(r) },
  ];

function renderUserFeedbacksTable() {
  const filtered = filterUserFeedbacks(userFeedbacksData);
    setRowCount('countFeedbacks', filtered);
    updateFeedbackHeaderStats(filtered);
    updateFeedbackFilterHint();
    updateSectionNavCount('sec-feedbacks', filtered.length);
  if (!isExplorerSectionActive('sec-feedbacks')) return;
  renderTable('userFeedbacksWrap', filtered, FEEDBACK_COLUMNS, 'No feedback for the selected dates / stars.', {
    explore: 'userFeedbacksWrap',
    rerender: renderUserFeedbacksTable,
    resetKey: feedbackFilter.from + '|' + feedbackFilter.to + '|' + feedbackFilter.star,
  });
}

// ---- Spin wheel and daily rewards (paged API lists inside the data explorer) ----

const REWARD_RECORD_PAGE_SIZE = 25;
const REWARD_FETCH_PAGE_SIZE = 200;
const REWARD_USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rewardOpenButton(group) {
  const key = group.userId || group.userName;
  const name = group.userName || 'Unknown';
  return '<button type="button" class="link-btn" data-reward-user="' + escAttr(key) + '"' +
    tipAttr('Show every log for ' + name) + '>' + escHtml(name) + '</button>';
}

const SPIN_WHEEL_SUMMARY_COLUMNS = [
  { label: 'User', render: rewardOpenButton },
  { label: 'User ID', render: (r) => rewardIdCell(r.userId) },
  { label: 'Spins', align: 'right', render: (r) => fmtInt(r.count) },
  { label: 'Reward', align: 'right', render: (r) => moneyHtml(r.sum, 'up') },
  { label: 'Last spin', render: (r) => renderTimezoneDateHtml(r.latestAt) },
];

const SPIN_WHEEL_COLUMNS = [
  { label: 'User', render: (r) => rewardUserCell(r.userName) },
  { label: 'User ID', render: (r) => rewardIdCell(r.userId) },
  { label: 'Reward', align: 'right', render: (r) => moneyHtml(r.reward, 'up') },
  { label: 'Before', align: 'right', render: (r) => '$' + fmtMoney(r.beforeBalance) },
  { label: 'After', align: 'right', render: (r) => '$' + fmtMoney(r.afterBalance) },
  { label: 'Created', render: (r) => renderTimezoneDateHtml(r.createdAt) },
];

const DAILY_REWARD_SUMMARY_COLUMNS = [
  { label: 'User', render: rewardOpenButton },
  { label: 'User ID', render: (r) => rewardIdCell(r.userId) },
  { label: 'Claims', align: 'right', render: (r) => fmtInt(r.count) },
  { label: 'Coins', align: 'right', render: (r) => moneyHtml(r.sum, 'up') },
  { label: 'Streak', align: 'right', render: (r) => fmtInt(r.latestStreak) },
  { label: 'Last claimed', render: (r) => renderTimezoneDateHtml(r.latestAt) },
];

const DAILY_REWARD_COLUMNS = [
  { label: 'User', render: (r) => rewardUserCell(r.userName) },
  { label: 'User ID', render: (r) => rewardIdCell(r.userId) },
  { label: 'Coins', align: 'right', render: (r) => moneyHtml(r.coinsAwarded, 'up') },
  { label: 'Before', align: 'right', render: (r) => '$' + fmtMoney(r.balanceBefore) },
  { label: 'After', align: 'right', render: (r) => '$' + fmtMoney(r.balanceAfter) },
  { label: 'Streak', align: 'right', render: (r) => fmtInt(r.streakCount) },
  { label: 'Claimed', render: (r) => renderTimezoneDateHtml(r.claimedAt) },
];

const REWARD_RECORD_TABS = {
  'sec-spin-wheel': {
    path: '/spin-wheel-records',
    wrapId: 'spinWheelWrap',
    pagerId: 'spinWheelPager',
    countId: 'countSpinWheel',
    jumpId: 'spinWheelPageJump',
    pageAttr: 'data-spin-page',
    filterBtn: 'spinWheelFilterBtn',
    clearBtn: 'spinWheelClearBtn',
    fields: { userName: 'spinWheelUserName', userId: 'spinWheelUserId', from: 'spinWheelFrom', to: 'spinWheelTo' },
    subId: 'spinWheelSub',
    noun: 'spin',
    summaryHint: 'One row per user · reward is the total · click a user for their spins',
    summaryColumns: SPIN_WHEEL_SUMMARY_COLUMNS,
    columns: SPIN_WHEEL_COLUMNS,
    amountKey: 'reward',
    dateKey: 'createdAt',
    empty: 'No spin wheel records match these filters.',
    demo: (query) => getDemoSpinWheelRecords(query),
    normalize: (r) => ({
      id: apiField(r, 'id', ''),
      userId: apiField(r, 'userId', ''),
      userName: apiField(r, 'userName', ''),
      reward: apiField(r, 'reward', 0),
      beforeBalance: apiField(r, 'beforeBalance', 0),
      afterBalance: apiField(r, 'afterBalance', 0),
      createdAt: apiField(r, 'createdAt', ''),
    }),
  },
  'sec-daily-rewards': {
    path: '/daily-rewards',
    wrapId: 'dailyRewardWrap',
    pagerId: 'dailyRewardPager',
    countId: 'countDailyRewards',
    jumpId: 'dailyRewardPageJump',
    pageAttr: 'data-daily-page',
    filterBtn: 'dailyRewardFilterBtn',
    clearBtn: 'dailyRewardClearBtn',
    fields: { userName: 'dailyRewardUserName', userId: 'dailyRewardUserId', from: 'dailyRewardFrom', to: 'dailyRewardTo' },
    subId: 'dailyRewardSub',
    noun: 'claim',
    summaryHint: 'One row per user · coins are the total · click a user for their claims',
    summaryColumns: DAILY_REWARD_SUMMARY_COLUMNS,
    columns: DAILY_REWARD_COLUMNS,
    amountKey: 'coinsAwarded',
    dateKey: 'claimedAt',
    trackStreak: true,
    empty: 'No daily reward records match these filters.',
    demo: (query) => getDemoDailyRewardRecords(query),
    normalize: (r) => ({
      id: apiField(r, 'id', ''),
      userId: apiField(r, 'userId', ''),
      userName: apiField(r, 'userName', ''),
      coinsAwarded: apiField(r, 'coinsAwarded', 0),
      balanceBefore: apiField(r, 'balanceBefore', 0),
      balanceAfter: apiField(r, 'balanceAfter', 0),
      streakCount: apiField(r, 'streakCount', 0),
      claimedAt: apiField(r, 'claimedAt', ''),
    }),
  },
};

const rewardRecordState = {};

function rewardState(tab) {
  if (!rewardRecordState[tab]) {
    rewardRecordState[tab] = {
      page: 1,
      totalCount: 0,
      items: [],
      groups: [],
      selectedUserId: '',
      loading: false,
      loaded: false,
      token: 0,
      error: '',
      query: { userName: '', userId: '', from: '', to: '' },
    };
  }
  return rewardRecordState[tab];
}

function rewardUserCell(name) {
  return name ? '<span class="cell-user">' + escHtml(name) + '</span>' : EMPTY_CELL_HTML;
}

function rewardIdCell(id) {
  return id ? '<span class="cell-id">' + escHtml(id) + '</span>' : EMPTY_CELL_HTML;
}

function readRewardFilters(cfg) {
  return {
    userName: ($(cfg.fields.userName)?.value || '').trim(),
    userId: ($(cfg.fields.userId)?.value || '').trim(),
    from: $(cfg.fields.from)?.value || '',
    to: $(cfg.fields.to)?.value || '',
  };
}

function writeRewardFilters(cfg, query) {
  setInputValue(cfg.fields.userName, query.userName || '');
  setInputValue(cfg.fields.userId, query.userId || '');
  setInputValue(cfg.fields.from, query.from || '');
  setInputValue(cfg.fields.to, query.to || '');
}

/** Restores tab counts after the explorer nav is rebuilt on each summary refresh. */
function syncRewardRecordNavCounts() {
  for (const tab of Object.keys(REWARD_RECORD_TABS)) {
    const state = rewardRecordState[tab];
    if (state?.loaded) updateSectionNavCount(tab, state.totalCount);
  }
}

async function fetchRewardRecords(cfg, query) {
  const pageSize = query.pageSize || REWARD_FETCH_PAGE_SIZE;
  if (isDemoMode()) return cfg.demo({ ...query, pageSize });

  const params = new URLSearchParams();
  params.set('page', String(query.page || 1));
  params.set('pageSize', String(pageSize));
  if (query.userName) params.set('userName', query.userName);
  if (query.userId) params.set('userId', query.userId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);

  const json = await fetchApiJson(cfg.path + '?' + params.toString());
  const data = json.data || {};
  return {
    items: data.items || data.Items || [],
    totalCount: Number(apiField(data, 'totalCount', 0)),
    page: Number(apiField(data, 'page', query.page)),
    pageSize: Number(apiField(data, 'pageSize', pageSize)),
  };
}


/** One row per user: count and sum of the amount, plus the newest log's date (and streak). */
function groupRewardUsers(cfg, rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.userId || row.userName || '');
    let group = groups.get(key);
    if (!group) {
      group = {
        userId: row.userId,
        userName: row.userName,
        count: 0,
        sum: 0,
        latestAt: '',
        latestStreak: 0,
        logs: [],
      };
      groups.set(key, group);
    }
    if (row.userName) group.userName = row.userName;
    group.count += 1;
    group.sum += finiteNumber(row[cfg.amountKey]);
    group.logs.push(row);
    if (String(row[cfg.dateKey] || '') > String(group.latestAt)) {
      group.latestAt = row[cfg.dateKey] || '';
      if (cfg.trackStreak) group.latestStreak = finiteNumber(row.streakCount);
    }
  }
  return [...groups.values()].sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));
}

function rewardVisibleRows(tab) {
  const state = rewardState(tab);
  if (!state.selectedUserId) return state.groups || [];
  const key = String(state.selectedUserId);
  return (state.groups || []).find((g) => String(g.userId || g.userName) === key)?.logs || [];
}

function renderRewardSubtitle(tab) {
  const cfg = REWARD_RECORD_TABS[tab];
  const state = rewardState(tab);
  const sub = $(cfg.subId);
  if (!sub) return;
  if (!state.selectedUserId) {
    const loaded = state.items?.length || 0;
    const total = Number(state.totalCount || 0);
    const hint = state.loaded && total > loaded
      ? 'Latest ' + fmtInt(loaded) + ' of ' + fmtInt(total) + ' ' + cfg.noun + 's · click a user to load that player'
      : cfg.summaryHint;
    setHtml(sub, escHtml(hint));
    return;
  }
  const group = (state.groups || []).find((g) => String(g.userId || g.userName) === String(state.selectedUserId));
  const name = group?.userName || 'User';
  const shown = group?.logs.length || 0;
  const total = Number(group?.totalLogs || shown);
  const detail = total > shown
    ? 'latest ' + fmtInt(shown) + ' of ' + fmtInt(total)
    : countLabel(shown, 'log');
  setHtml(sub,
    '<button type="button" class="link-btn" data-reward-back>← All users</button>' +
    '<span> · ' + escHtml(name) + ' · ' + escHtml(detail) + '</span>');
}

function renderRewardPager(tab) {
  const cfg = REWARD_RECORD_TABS[tab];
  const state = rewardState(tab);
  const pager = $(cfg.pagerId);
  if (!pager) return;
  if (!state.loaded) {
    setHtml(pager, '');
    return;
  }
  const total = rewardVisibleRows(tab).length;
  const pageSize = REWARD_RECORD_PAGE_SIZE;
  setHtml(pager, renderPagerHtml({
    dataAttr: cfg.pageAttr,
    page: Number(state.page || 1),
    pageSize,
    total,
    totalPages: pageCount(total, pageSize),
    jumpInputId: cfg.jumpId,
  }));
}

function renderRewardRecords(tab) {
  const cfg = REWARD_RECORD_TABS[tab];
  const state = rewardState(tab);
  const wrap = $(cfg.wrapId);
  wrap?.classList.toggle('is-loading', state.loading);
  renderRewardSubtitle(tab);
  if (state.loaded) {
    const viewingUser = !!state.selectedUserId;
    const shown = rewardVisibleRows(tab).length;
    const loaded = state.items.length;
    const total = Number(state.totalCount || loaded);
    setText(cfg.countId, viewingUser
      ? countLabel(shown, 'log')
      : countLabel(state.groups.length, 'user') + ' · ' +
        (total > loaded ? 'latest ' + fmtInt(loaded) + ' of ' + fmtInt(total) + ' logs' : countLabel(total, 'log')));
    updateSectionNavCount(tab, state.totalCount);
  }
  renderRewardPager(tab);
  if (!isExplorerSectionActive(tab)) return;
  if (state.loading && !state.items.length) {
    setHtml(cfg.wrapId, skeletonHtml(8));
    return;
  }
  if (state.error && !state.items.length) {
    const hint = /GUID/i.test(state.error) ? 'Enter a GUID, or leave User ID empty.' : undefined;
    setHtml(cfg.wrapId, errorHtml(state.error, hint));
    return;
  }
  const rows = rewardVisibleRows(tab);
  const pageSize = REWARD_RECORD_PAGE_SIZE;
  const totalPages = pageCount(rows.length, pageSize);
  state.page = Math.min(Math.max(1, Number(state.page || 1)), totalPages);
  const start = (state.page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const columns = state.selectedUserId ? cfg.columns : cfg.summaryColumns;
  renderTable(cfg.wrapId, pageRows, columns, state.error || cfg.empty);
}

/** First open loads one page. Coming back to the tab shows what is already loaded. */
function showRewardRecords(tab) {
  const state = rewardState(tab);
  if (state.loading || state.loaded) {
    renderRewardRecords(tab);
    return;
  }
  loadRewardRecords(tab, { page: 1, query: readRewardFilters(REWARD_RECORD_TABS[tab]) });
}

async function loadRewardRecords(tab, { page, query } = {}) {
  const cfg = REWARD_RECORD_TABS[tab];
  if (!cfg) return;
  const state = rewardState(tab);
  const nextQuery = query || state.query;
  const nextPage = Math.max(1, Number(page || 1));
  if (nextQuery.userId && !REWARD_USER_ID_RE.test(nextQuery.userId)) {
    state.token += 1;
    state.loading = false;
    state.loaded = true;
    state.error = 'userId must be a valid GUID.';
    state.items = [];
    state.groups = [];
    state.selectedUserId = '';
    state.totalCount = 0;
    state.page = 1;
    state.query = nextQuery;
    writeRewardFilters(cfg, nextQuery);
    renderRewardRecords(tab);
    return;
  }

  const token = ++state.token;
  const queryChanged = JSON.stringify(nextQuery) !== JSON.stringify(state.query);
  state.loading = true;
  state.error = '';
  state.query = nextQuery;
  if (queryChanged) state.selectedUserId = '';
  state.page = queryChanged ? 1 : nextPage;
  writeRewardFilters(cfg, nextQuery);
  renderRewardRecords(tab);
  try {
    const pageData = await fetchRewardRecords(cfg, { ...nextQuery, page: 1, pageSize: REWARD_FETCH_PAGE_SIZE });
    if (state.token !== token) return;
    const items = (pageData.items || []).map(cfg.normalize);
    state.items = items;
    state.groups = groupRewardUsers(cfg, items);
    state.totalCount = Number(pageData.totalCount || items.length);
    if (state.selectedUserId && !state.groups.some((g) => String(g.userId || g.userName) === String(state.selectedUserId))) {
      state.selectedUserId = '';
    }
    state.loaded = true;
    state.loading = false;
    renderRewardRecords(tab);
  } catch (err) {
    if (state.token !== token) return;
    state.loading = false;
    state.loaded = true;
    state.items = [];
    state.groups = [];
    state.selectedUserId = '';
    state.totalCount = 0;
    state.error = err?.message || 'Failed to load records.';
    renderRewardRecords(tab);
  }
}

function openRewardUserLogs(tab, userKey) {
  const cfg = REWARD_RECORD_TABS[tab];
  const state = rewardState(tab);
  if (!cfg || !userKey || state.loading) return;
  const group = (state.groups || []).find((g) => String(g.userId || g.userName) === String(userKey));
  state.selectedUserId = String(userKey);
  state.page = 1;
  // The list page already holds every matching log.
  if ((state.items?.length || 0) >= Number(state.totalCount || 0)) {
    renderRewardRecords(tab);
    return;
  }
  const userId = group?.userId && REWARD_USER_ID_RE.test(group.userId) ? group.userId : '';
  const userName = userId ? '' : (group?.userName || '');
  if (!userId && !userName) {
    renderRewardRecords(tab);
    return;
  }
  const token = ++state.token;
  state.loading = true;
  state.error = '';
  renderRewardRecords(tab);
  fetchRewardRecords(cfg, {
    userId, userName, from: state.query.from || '', to: state.query.to || '', page: 1, pageSize: REWARD_FETCH_PAGE_SIZE,
  }).then((pageData) => {
    if (state.token !== token) return;
    const logs = (pageData.items || []).map(cfg.normalize);
    if (group) {
      group.logs = logs;
      group.totalLogs = Number(pageData.totalCount || logs.length);
    }
    state.loading = false;
    renderRewardRecords(tab);
  }).catch((err) => {
    if (state.token !== token) return;
    state.loading = false;
    state.error = err?.message || 'Failed to load records.';
    renderRewardRecords(tab);
  });
}

function closeRewardUserLogs(tab) {
  const state = rewardState(tab);
  state.selectedUserId = '';
  state.page = 1;
  renderRewardRecords(tab);
}

function jumpRewardRecordsPage(tab, targetPage) {
  const state = rewardState(tab);
  if (state.loading) return;
  const totalPages = pageCount(rewardVisibleRows(tab).length, REWARD_RECORD_PAGE_SIZE);
  const parsed = parseInt(String(targetPage ?? '').trim(), 10);
  const page = Number.isFinite(parsed) ? Math.min(totalPages, Math.max(1, parsed)) : 1;
  if (page === Number(state.page || 1)) return;
  state.page = page;
  renderRewardRecords(tab);
}

function handleRewardPagerClick(tab, e) {
  const cfg = REWARD_RECORD_TABS[tab];
  const btn = e.target.closest('[' + cfg.pageAttr + ']');
  if (!btn || btn.disabled || rewardState(tab).loading) return;
  e.preventDefault();
  e.stopPropagation();
  const page = Number(rewardState(tab).page || 1);
  const targets = {
    first: () => 1,
    prev: () => page - 1,
    next: () => page + 1,
    last: () => pageCount(rewardVisibleRows(tab).length, REWARD_RECORD_PAGE_SIZE),
    goto: () => $(cfg.jumpId)?.value,
  };
  const target = targets[btn.getAttribute(cfg.pageAttr) || ''];
  if (target) jumpRewardRecordsPage(tab, target());
}

function bindRewardRecordEvents() {
  for (const [tab, cfg] of Object.entries(REWARD_RECORD_TABS)) {
    $(cfg.filterBtn)?.addEventListener('click', () => {
      loadRewardRecords(tab, { page: 1, query: readRewardFilters(cfg) });
    });
    $(cfg.clearBtn)?.addEventListener('click', () => {
      loadRewardRecords(tab, { page: 1, query: { userName: '', userId: '', from: '', to: '' } });
    });
    for (const id of Object.values(cfg.fields)) {
      $(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          loadRewardRecords(tab, { page: 1, query: readRewardFilters(cfg) });
        }
      });
    }
    $(tab)?.addEventListener('click', (e) => {
      if (e.target.closest('[data-reward-back]')) {
        e.preventDefault();
        closeRewardUserLogs(tab);
        return;
      }
      const userBtn = e.target.closest('[data-reward-user]');
      if (!userBtn?.closest('#' + cfg.wrapId)) return;
      e.preventDefault();
      e.stopPropagation();
      openRewardUserLogs(tab, userBtn.getAttribute('data-reward-user'));
    });
    $(cfg.pagerId)?.addEventListener('click', (e) => handleRewardPagerClick(tab, e));
    $(cfg.pagerId)?.addEventListener('keydown', (e) => {
      if (e.target?.id === cfg.jumpId && e.key === 'Enter') {
        e.preventDefault();
        jumpRewardRecordsPage(tab, e.target.value);
      }
    });
  }
}

function bindFeedbackEvents() {
  $('feedbackFilterBtn').addEventListener('click', applyFeedbackDateFilter);
  $('feedbackClearFilterBtn').addEventListener('click', clearFeedbackDateFilter);
  $('feedbackStarFilter').addEventListener('change', applyFeedbackDateFilter);
  for (const id of ['feedbackDateFrom', 'feedbackDateTo']) {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applyFeedbackDateFilter();
    });
  }
}
