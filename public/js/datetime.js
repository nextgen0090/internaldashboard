// Single source of truth for dashboard dates and times.
//
// Every API/DB timestamp is a UTC instant. Values without a zone suffix ("2026-10-02T09:35:30")
// are UTC too. Parse once with parseUtc(), keep the Date for sorting/filtering, and convert to
// a time zone only when formatting for display.
//
// Display zone: window.DASHBOARD_TIMEZONE, else localStorage "dashboardTimeZone", else Asia/Karachi.

const DEFAULT_DISPLAY_TZ = 'Asia/Karachi';
const DISPLAY_TZ_STORAGE_KEY = 'dashboardTimeZone';
const US_EASTERN_TZ = 'America/New_York';
const DATE_LOCALE = 'en-US';

const DATE_TIME_FORMAT = { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
const CLOCK_FORMAT = { weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
const TIME_FORMAT = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
const SHORT_DATE_FORMAT = { year: 'numeric', month: 'short', day: 'numeric' };

const HAS_TIMEZONE_SUFFIX = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const DATE_TIME_PARTS = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat(DATE_LOCALE, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function storedTimeZone() {
  try {
    return window.localStorage.getItem(DISPLAY_TZ_STORAGE_KEY);
  } catch {
    return null;
  }
}

const DISPLAY_TZ = [window.DASHBOARD_TIMEZONE, storedTimeZone(), DEFAULT_DISPLAY_TZ]
  .find((tz) => tz && isValidTimeZone(tz)) || 'UTC';

const DISPLAY_TZ_LABEL = window.DASHBOARD_TIMEZONE_LABEL
  || (DISPLAY_TZ === 'Asia/Karachi' ? 'PKT' : shortZoneName(DISPLAY_TZ));

function shortZoneName(tz) {
  const part = new Intl.DateTimeFormat(DATE_LOCALE, { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName');
  return part ? part.value : tz;
}

// ---- Parsing ----

function validDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

/** API timestamp → Date (UTC instant). Suffix-less values are UTC. Returns null when invalid. */
function parseUtc(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return validDate(value);
  if (typeof value === 'number') return validDate(new Date(value));

  // .NET sends up to 7 fractional digits; not every browser parses more than 3.
  const text = String(value).trim().replace(/(\.\d{3})\d+/, '$1');
  if (!text) return null;
  if (HAS_TIMEZONE_SUFFIX.test(text)) return validDate(new Date(text.replace(' ', 'T')));

  const m = text.match(DATE_TIME_PARTS);
  if (!m) return null;
  return validDate(new Date(Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0),
    Number(((m[7] || '') + '000').slice(0, 3))
  )));
}

/** Milliseconds since epoch for sorting; invalid/missing → NaN. */
function utcMillis(value) {
  const d = parseUtc(value);
  return d ? d.getTime() : NaN;
}

/** Newest-first comparator on raw timestamps; rows without a valid date go last. */
function compareUtcDesc(a, b) {
  const ta = utcMillis(a);
  const tb = utcMillis(b);
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return tb - ta;
}

// ---- Time zone math ----

const partsFormatters = {};

function partsFormatter(timeZone) {
  if (!partsFormatters[timeZone]) {
    partsFormatters[timeZone] = new Intl.DateTimeFormat(DATE_LOCALE, {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
  return partsFormatters[timeZone];
}

/** Calendar/clock fields of an instant as seen in `timeZone`. */
function zonedParts(date, timeZone = DISPLAY_TZ) {
  const p = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

function zoneOffsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getUTCMilliseconds());
}

/** "yyyy-mm-dd" + "HH:mm" entered in `timeZone` → Date (UTC instant). */
function zonedWallTimeToUtc(day, time, timeZone = DISPLAY_TZ) {
  const d = DAY_KEY.exec(String(day || ''));
  const t = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
  if (!d || !t) return null;
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let utc = guess - zoneOffsetMs(new Date(guess), timeZone);
  const corrected = guess - zoneOffsetMs(new Date(utc), timeZone);
  if (corrected !== utc) utc = corrected;
  return new Date(utc);
}

/** Suffix-less UTC wall clock ("yyyy-mm-ddTHH:mm:ss") — the format the backend stores as-is. */
function toUtcApiString(date) {
  const d = validDate(date);
  if (!d) return null;
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) +
    'T' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
}

/** Date + HH:mm typed in the display zone → UTC API string (null when either part is missing/invalid). */
function displayInputsToUtcApiString(day, time) {
  return toUtcApiString(zonedWallTimeToUtc(day, time));
}

// ---- Day keys (yyyy-mm-dd) ----

/** yyyy-mm-dd of an instant in `timeZone` (value format of <input type="date">). Defaults to now. */
function toDateInputValue(value = new Date(), timeZone = DISPLAY_TZ) {
  const d = parseUtc(value);
  if (!d) return '';
  const p = zonedParts(d, timeZone);
  return p.year + '-' + pad2(p.month) + '-' + pad2(p.day);
}

/** HH:mm (24-hour) of an instant in `timeZone`. */
function toTimeInputValue(value = new Date(), timeZone = DISPLAY_TZ) {
  const d = parseUtc(value);
  if (!d) return '';
  const p = zonedParts(d, timeZone);
  return pad2(p.hour) + ':' + pad2(p.minute);
}

function dayKeyToUtcNoon(dayKey) {
  const m = DAY_KEY.exec(String(dayKey || ''));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
}

/** Whole days between two yyyy-mm-dd keys (b − a). */
function dayKeyDiff(a, b) {
  const da = dayKeyToUtcNoon(a);
  const db = dayKeyToUtcNoon(b);
  return da && db ? Math.round((db - da) / 86400000) : NaN;
}

/** yyyy-mm-dd key `days` calendar days after (negative: before) `dayKey`; defaults to today in the display zone. */
function shiftDayKey(days, dayKey = toDateInputValue()) {
  const d = dayKeyToUtcNoon(dayKey);
  return d ? toDateInputValue(new Date(d.getTime() + days * 86400000), 'UTC') : '';
}

/** True when the instant falls on a calendar day in [fromDay, toDay] (either bound optional) in `timeZone`. */
function isWithinDayRange(value, fromDay, toDay, timeZone = DISPLAY_TZ) {
  const key = toDateInputValue(value, timeZone);
  if (!key) return false;
  if (fromDay && key < fromDay) return false;
  if (toDay && key > toDay) return false;
  return true;
}

function isTodayDate(value, timeZone = DISPLAY_TZ) {
  const key = toDateInputValue(value, timeZone);
  return !!key && key === toDateInputValue(new Date(), timeZone);
}

function relativeDateHint(value, timeZone = DISPLAY_TZ) {
  const diffDays = dayKeyDiff(toDateInputValue(value, timeZone), toDateInputValue(new Date(), timeZone));
  if (!(diffDays > 0)) return '';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return diffDays + ' days ago';
  if (diffDays < 365) {
    const months = Math.round(diffDays / 30);
    return months === 1 ? '1 month ago' : months + ' months ago';
  }
  const years = Math.round(diffDays / 365);
  return years === 1 ? '1 year ago' : years + ' years ago';
}

// ---- Formatting ----

function formatInZone(value, options, timeZone) {
  const d = parseUtc(value);
  return d ? d.toLocaleString(DATE_LOCALE, { ...options, timeZone }) : '—';
}

/** "October 2, 2026 at 2:35 PM" in the display zone (or `timeZone`). */
function formatDateTime(value, timeZone = DISPLAY_TZ) {
  return formatInZone(value, DATE_TIME_FORMAT, timeZone);
}

function formatDateTimeUtc(value) {
  return formatDateTime(value, 'UTC');
}

function formatDateTimeUs(value) {
  return formatDateTime(value, US_EASTERN_TZ);
}

/** "2:35:30 PM" in the display zone. */
function formatTime(value, timeZone = DISPLAY_TZ) {
  return formatInZone(value, TIME_FORMAT, timeZone);
}

function formatClock(value, timeZone = DISPLAY_TZ) {
  return formatInZone(value, CLOCK_FORMAT, timeZone);
}

/** "yyyy-mm-dd HH:mm" (24-hour) in the display zone; '' when missing. */
function formatDateTime24h(value, timeZone = DISPLAY_TZ) {
  return parseUtc(value) ? toDateInputValue(value, timeZone) + ' ' + toTimeInputValue(value, timeZone) : '';
}

/** Compact 24-hour display-zone time with the UTC time as a tooltip; em dash when missing. */
function renderDateTime24hHtml(value) {
  const d = parseUtc(value);
  if (!d) return '<span class="cell-empty">—</span>';
  return '<span class="cell-date" title="' + escAttr('UTC ' + formatDateTime24h(d, 'UTC')) + '">' +
    escHtml(formatDateTime24h(d)) + ' <span class="tz-tag">' + escHtml(DISPLAY_TZ_LABEL) + '</span></span>';
}

/** Calendar day key "2026-10-02" → "Oct 2, 2026" (no zone shift: it is already a day). */
function formatDayLabel(dayKey) {
  const d = dayKeyToUtcNoon(dayKey);
  return d ? d.toLocaleDateString(DATE_LOCALE, { ...SHORT_DATE_FORMAT, timeZone: 'UTC' }) : String(dayKey || '');
}

/** File-name safe stamp "2026-10-02_143530" in the display zone. */
function fileTimestamp(value = new Date(), timeZone = DISPLAY_TZ) {
  const d = parseUtc(value);
  if (!d) return '';
  const p = zonedParts(d, timeZone);
  return toDateInputValue(d, timeZone) + '_' + pad2(p.hour) + pad2(p.minute) + pad2(p.second);
}

/** UTC timestamp rendered as stacked UTC, US Eastern and display-zone rows (with a Today badge / age hint). */
function renderTimezoneDateHtml(value) {
  const d = parseUtc(value);
  if (!d) return '<span class="empty">—</span>';

  const age = relativeDateHint(d);
  const today = isTodayDate(d);
  const row = (cls, label, text, extraHtml = '') =>
    '<span class="feedback-date-row ' + cls + '">' +
      '<span class="feedback-tz-label">' + escHtml(label) + '</span>' + escHtml(text) + extraHtml +
    '</span>';

  return '<span class="feedback-date-stack' + (today ? ' feedback-date-today' : ' feedback-date-other') + '"' +
      ' title="' + escAttr(d.toISOString()) + '">' +
    (today ? '<span class="feedback-today-badge">Today</span>' : '') +
    row('feedback-date-utc', 'UTC', formatDateTimeUtc(d)) +
    row('feedback-date-us', 'US', formatDateTimeUs(d)) +
    row('feedback-date-local', DISPLAY_TZ_LABEL, formatDateTime(d),
      age ? ' <span class="feedback-date-age">(' + escHtml(age) + ')</span>' : '') +
    '</span>';
}

// ---- Live clocks ----

let timezoneClockTimer = null;

/** "Now · UTC … · US (Eastern) … · PKT …" clocks shown in the Feedbacks and User Game Play headers. */
function updateTimezoneClocks() {
  const now = new Date();
  const text = 'Now · UTC: ' + formatClock(now, 'UTC') +
    '  ·  US (Eastern): ' + formatClock(now, US_EASTERN_TZ) +
    '  ·  ' + DISPLAY_TZ_LABEL + ' (' + DISPLAY_TZ + '): ' + formatClock(now);
  setText('feedbackTzClock', text);
  setText('ugpTzClock', text);
}

function startTimezoneClock() {
  document.querySelectorAll('.display-tz-label').forEach((el) => { el.textContent = DISPLAY_TZ_LABEL; });
  updateTimezoneClocks();
  if (timezoneClockTimer) return;
  timezoneClockTimer = window.setInterval(updateTimezoneClocks, 1000);
}
