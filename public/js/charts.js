// Lightweight chart components (HTML/SVG strings) shared by the Overview and User Game Play.
// Charts only plot values returned by the API (or sums of them); nothing is estimated.

function pctOf(value, max) {
  return max > 0 ? Math.max(0, Math.min(100, (Number(value || 0) / max) * 100)) : 0;
}

function tipAttr(text) {
  return text ? ' data-tip="' + escAttr(text) + '"' : '';
}

/** Round up to a readable axis maximum whose quarters are also round (1, 2, 4, 6, 8 × 10^n). */
function niceCeil(value) {
  const v = Math.abs(Number(value || 0));
  if (!v) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const step = [1, 2, 4, 6, 8, 10].find((s) => s * exp >= v);
  return step * exp;
}

/** Tiny trend line for KPI cards; empty until there are two samples. */
function sparklineHtml(values, tone = 'info') {
  const nums = values.map(Number).filter(Number.isFinite);
  if (nums.length < 2) return '';
  const min = Math.min(...nums);
  const span = Math.max(...nums) - min || 1;
  const pts = nums.map((v, i) =>
    ((i / (nums.length - 1)) * 100).toFixed(2) + ',' + (27 - ((v - min) / span) * 24).toFixed(2)
  ).join(' ');
  return '<svg class="spark tone-' + tone + '" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">' +
    '<polygon class="spark-area" points="0,30 ' + pts + ' 100,30"/>' +
    '<polyline class="spark-line" points="' + pts + '" vector-effect="non-scaling-stroke"/></svg>';
}

/** Horizontal meter with optional reference marks, e.g. RTP against a 100% break-even line. */
function meterHtml(value, { max = 1, tone = 'info', marks = [] } = {}) {
  return '<div class="meter tone-' + tone + '">' +
    '<span class="meter-fill" style="width:' + pctOf(value, max).toFixed(2) + '%"></span>' +
    marks.map((m) =>
      '<span class="meter-mark" style="left:' + pctOf(m.at, max).toFixed(2) + '%"' + tipAttr(m.label) + '></span>'
    ).join('') +
    '</div>';
}

/** Proportional split (e.g. recharge vs redeem) with a legend of values and shares. */
function splitBarHtml(parts, format = (n) => '$' + fmtMoney(n), { legend = true } = {}) {
  const total = parts.reduce((s, p) => s + Math.max(0, Number(p.value || 0)), 0);
  const share = (p) => (total ? (Math.max(0, Number(p.value || 0)) / total) * 100 : 0);
  return '<div class="split">' +
    '<div class="split-bar">' + parts.map((p) =>
      '<span class="tone-' + p.tone + '" style="flex-grow:' + share(p).toFixed(3) + '"' +
      tipAttr(p.label + ': ' + format(p.value) + ' (' + share(p).toFixed(1) + '%)') + '></span>'
    ).join('') + '</div>' +
    (legend
      ? '<div class="split-legend">' + parts.map((p) =>
        '<span class="tone-' + p.tone + '"><i></i>' + escHtml(p.label) + ' <b>' + format(p.value) + '</b>' +
        '<em>' + share(p).toFixed(0) + '%</em></span>'
      ).join('') + '</div>'
      : '') +
    '</div>';
}

/**
 * Ranked horizontal bars. Item: { label, value, tone, tip, valueText, attrs } — `attrs` (raw HTML
 * attributes such as data-drill) turns the row into a button.
 */
function barListHtml(items, { format = fmtInt, max } = {}) {
  const top = max ?? Math.max(0, ...items.map((i) => Number(i.value || 0)));
  return '<div class="bar-list">' + items.map((item) => {
    const tag = item.attrs ? 'button type="button" class="bar-row row-btn"' + item.attrs : 'div class="bar-row"';
    const close = item.attrs ? 'button' : 'div';
    return '<' + tag + tipAttr(item.tip) + '>' +
      '<span class="bar-label">' + escHtml(item.label) + '</span>' +
      '<span class="bar-track"><span class="bar-fill tone-' + (item.tone || 'info') + '" style="width:' +
      pctOf(item.value, top).toFixed(2) + '%"></span></span>' +
      '<span class="bar-value">' + (item.valueText ?? format(item.value)) + '</span>' +
      '</' + close + '>';
  }).join('') + '</div>';
}

/** Titled wrapper for a chart inside a page (User Game Play tabs). */
function chartCardHtml(title, sub, bodyHtml) {
  return '<div class="chart-card-head"><h3>' + escHtml(title) + '</h3>' + (sub ? '<span>' + escHtml(sub) + '</span>' : '') + '</div>' + bodyHtml;
}

function chartLegendHtml(series) {
  return '<div class="chart-legend">' + series.map((s) =>
    '<span class="tone-' + s.tone + (s.line ? ' is-line' : '') + '"><i></i>' + escHtml(s.name) + '</span>'
  ).join('') + '</div>';
}

/**
 * Column chart with an optional line on its own (right) axis.
 * `columns`: [{ name, tone, values }], `line`: { name, tone, values, format }, `tips[i]`: hover text.
 */
function comboChartHtml({ labels, columns = [], line = null, format = fmtCompact, tips = [], height = 220 }) {
  const n = labels.length;
  if (!n) return '';
  const leftMax = niceCeil(Math.max(0, ...columns.flatMap((c) => c.values.map(Number))));
  const lineVals = line ? line.values.map(Number) : [];
  let lineMin = 0;
  let lineSpan = 1;
  if (line) {
    const lo = Math.min(...lineVals);
    const hi = Math.max(...lineVals);
    // `fromZero: false` zooms the axis to the data (balances); otherwise the axis starts at 0.
    lineMin = line.fromZero === false ? lo : Math.min(0, lo);
    lineSpan = niceCeil(hi - lineMin || Math.abs(hi) || 1);
    if (line.fromZero === false) {
      const step = lineSpan / 4;
      lineMin = Math.floor(lo / step) * step;
      if (lineMin + lineSpan < hi) lineSpan = niceCeil(hi - lineMin);
    }
  }
  const lineMax = lineMin + lineSpan;
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  const yLeft = columns.length
    ? '<div class="plot-y">' + ticks.map((t) => '<span>' + format(leftMax * t) + '</span>').join('') + '</div>'
    : '';
  const yRight = line
    ? '<div class="plot-y plot-y-right tone-' + line.tone + '">' +
      ticks.map((t) => '<span>' + (line.format || format)(lineMin + (lineMax - lineMin) * t) + '</span>').join('') + '</div>'
    : '';

  const cols = labels.map((_, i) =>
    '<div class="plot-col"' + tipAttr(tips[i]) + '>' +
    columns.map((c) => '<span class="plot-bar tone-' + c.tone + '" style="height:' + pctOf(c.values[i], leftMax).toFixed(2) + '%"></span>').join('') +
    '</div>'
  ).join('');

  let lineSvg = '';
  if (line && n) {
    const pts = lineVals.map((v, i) =>
      (((i + 0.5) / n) * 100).toFixed(2) + ',' + (100 - pctOf(v - lineMin, lineMax - lineMin)).toFixed(2)
    ).join(' ');
    lineSvg = '<svg class="plot-line tone-' + line.tone + '" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline points="' + pts + '" vector-effect="non-scaling-stroke"/></svg>';
  }

  const step = Math.max(1, Math.ceil(n / 8));
  const showLabel = (i) => i % step === 0 || (i === n - 1 && (n - 1) % step >= step / 2);
  const xLabels = labels.map((label, i) => showLabel(i)
    ? '<span style="left:' + (((i + 0.5) / n) * 100).toFixed(2) + '%">' + escHtml(label) + '</span>'
    : ''
  ).join('');

  const series = [...columns, ...(line ? [{ ...line, line: true }] : [])];
  return '<div class="combo">' + chartLegendHtml(series) +
    '<div class="plot' + (line ? ' has-right' : '') + (columns.length ? '' : ' no-left') + '" style="--plot-h:' + height + 'px">' +
    yLeft +
    '<div class="plot-area"><div class="plot-cols">' + cols + '</div>' + lineSvg + '</div>' +
    yRight +
    '<div class="plot-x">' + xLabels + '</div>' +
    '</div></div>';
}

/**
 * Bet (x) vs win (y) scatter on a shared scale, so the diagonal is break-even (RTP 100%).
 * Point: { x, y, size (0–1), tone, tip, attrs }.
 */
function scatterHtml(points, { format = fmtCompact } = {}) {
  const max = niceCeil(Math.max(0, ...points.flatMap((p) => [Number(p.x || 0), Number(p.y || 0)])));
  const dots = points.map((p) => {
    const size = 10 + Math.round((p.size || 0) * 14);
    const style = 'left:' + pctOf(p.x, max).toFixed(2) + '%;bottom:' + pctOf(p.y, max).toFixed(2) + '%;--s:' + size + 'px';
    return p.attrs
      ? '<button type="button" class="sc-dot row-btn tone-' + p.tone + '" style="' + style + '"' + p.attrs + tipAttr(p.tip) + ' aria-label="' + escAttr(p.tip) + '"></button>'
      : '<span class="sc-dot tone-' + p.tone + '" style="' + style + '"' + tipAttr(p.tip) + '></span>';
  }).join('');
  return '<div class="scatter">' +
    '<div class="plot-y">' + [1, 0.5, 0].map((t) => '<span>' + format(max * t) + '</span>').join('') + '</div>' +
    '<div class="sc-area">' +
    '<svg class="sc-diag" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,100 0,0 100,0"/><line x1="0" y1="100" x2="100" y2="0" vector-effect="non-scaling-stroke"/></svg>' +
    '<span class="sc-zone sc-zone-top">Players ahead</span><span class="sc-zone sc-zone-bottom">House ahead</span>' +
    dots + '</div>' +
    '<div class="plot-x sc-x">' + [0, 0.5, 1].map((t) => '<span style="left:' + t * 100 + '%">' + format(max * t) + '</span>').join('') + '</div>' +
    '</div>';
}

// ---- Tooltips ----

/** One floating tooltip for every [data-tip] element (icons, chart bars, dots); never clipped by scroll areas. */
function bindTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  let current = null;

  const hide = () => {
    current = null;
    tip.classList.remove('visible');
  };
  const showFor = (target) => {
    current = target;
    tip.textContent = target.dataset.tip;
    tip.classList.add('visible');
    const r = target.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    let top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  };
  const onEnter = (e) => {
    const target = e.target.closest?.('[data-tip]');
    if (target === current) return;
    if (target && target.dataset.tip) showFor(target);
    else hide();
  };

  document.addEventListener('mouseover', onEnter);
  document.addEventListener('focusin', onEnter);
  document.addEventListener('focusout', hide);
  // The hovered element is often re-rendered or hidden by the click itself.
  document.addEventListener('click', hide);
  document.addEventListener('keydown', hide);
  window.addEventListener('scroll', hide, { passive: true, capture: true });
}
