// Session spin graph, its downloadable report, and the spin response JSON modal.

// ---- Spin chart ----

// Session spin graph: canvas bar/line chart with zoom, pan, scroller and hover tooltip.

const CHART_HEIGHT = 360;
const CHART_PADDING = { left: 58, right: 18, top: 18, bottom: 42 };
const CHART_DEFAULT_HINT = 'Scroll to zoom · drag or scroller to pan';

let activeChartSpins = [];
let hoveredSpinIndex = -1;
let chartViewStart = 0;
let chartViewEnd = 0;
let chartPanState = null;
let chartSuppressClick = false;
let chartSmoothRaf = null;
let chartSmoothTargetStart = null;
let chartScrollDragging = false;

function isSpinFree(spin) {
  return spin?.isFreeSpin === true || spin?.IsFreeSpin === true;
}

function spinHasJson(spin) {
  return !!(spin && (spin.hasResponseJson ?? spin.HasResponseJson));
}

function spinId(spin) {
  return spin.id ?? spin.Id ?? '';
}

function minChartWindow(n) {
  return Math.min(n, Math.max(6, Math.ceil(n * 0.08)));
}

function chartWindowSize() {
  return Math.max(1, Math.round(chartViewEnd - chartViewStart + 1));
}

/** Shift a window of `size` spins starting at `start` so it stays within [0, maxIndex]. */
function fitChartWindow(start, size, maxIndex) {
  let s = start;
  let e = s + size - 1;
  if (s < 0) {
    s = 0;
    e = size - 1;
  }
  if (e > maxIndex) {
    e = maxIndex;
    s = Math.max(0, e - size + 1);
  }
  return { start: s, end: e };
}

function resetSpinChartZoom(spinCount = activeChartSpins.length, redraw = true) {
  stopChartSmoothPan(true);
  const n = Math.max(0, Number(spinCount) || 0);
  chartViewStart = 0;
  chartViewEnd = Math.max(0, n - 1);
  chartPanState = null;
  hoveredSpinIndex = -1;
  updateSpinZoomControls();
  if (redraw && activeChartSpins.length) renderSpinChart(activeChartSpins);
}

function stopChartSmoothPan(snapToTarget = false) {
  if (chartSmoothRaf) {
    cancelAnimationFrame(chartSmoothRaf);
    chartSmoothRaf = null;
  }
  if (snapToTarget && chartSmoothTargetStart != null) {
    const n = activeChartSpins.length;
    const fitted = fitChartWindow(chartSmoothTargetStart, chartWindowSize(), n ? n - 1 : Infinity);
    chartViewStart = fitted.start;
    chartViewEnd = fitted.end;
  }
  chartSmoothTargetStart = null;
}

/** Ease the view window toward `targetStart` (used by pan buttons and the scroller). */
function animateChartToStart(targetStart) {
  const n = activeChartSpins.length;
  if (!n) return;
  const windowSize = chartWindowSize();
  if (windowSize >= n) return;

  const maxStart = Math.max(0, n - windowSize);
  chartSmoothTargetStart = Math.min(maxStart, Math.max(0, Number(targetStart) || 0));

  if (chartSmoothRaf) return;

  const tick = () => {
    const target = chartSmoothTargetStart;
    if (target == null || !activeChartSpins.length) {
      chartSmoothRaf = null;
      return;
    }
    const size = chartWindowSize();
    const cur = chartViewStart;
    const diff = target - cur;
    if (Math.abs(diff) < 0.04) {
      chartViewStart = target;
      chartViewEnd = target + size - 1;
      chartSmoothRaf = null;
      chartSmoothTargetStart = null;
      updateSpinZoomControls({ syncScroller: !chartScrollDragging });
      hideSpinChartTooltip();
      renderSpinChart(activeChartSpins, -1);
      return;
    }
    chartViewStart = cur + diff * 0.32;
    chartViewEnd = chartViewStart + size - 1;
    updateSpinZoomControls({ syncScroller: false });
    hideSpinChartTooltip();
    renderSpinChart(activeChartSpins, -1);
    chartSmoothRaf = requestAnimationFrame(tick);
  };

  chartSmoothRaf = requestAnimationFrame(tick);
}

function clampChartView(start, end, spinCount) {
  const n = Math.max(1, spinCount);
  const minWindow = minChartWindow(n);
  let s = Math.max(0, Math.min(n - 1, Math.floor(start)));
  let e = Math.max(0, Math.min(n - 1, Math.ceil(end)));
  if (e < s) e = s;
  if (e - s + 1 < minWindow) {
    const mid = (s + e) / 2;
    const fitted = fitChartWindow(Math.floor(mid - (minWindow - 1) / 2), minWindow, n - 1);
    s = fitted.start;
    e = fitted.end;
  }
  if (e - s + 1 > n) {
    s = 0;
    e = n - 1;
  }
  return { start: s, end: e };
}

function updateSpinZoomControls(options = {}) {
  const syncScroller = options.syncScroller !== false;
  const n = activeChartSpins.length;
  const hint = $('spinZoomHint');
  const zoomInBtn = $('spinZoomInBtn');
  const zoomOutBtn = $('spinZoomOutBtn');
  const resetBtn = $('spinZoomResetBtn');
  const panLeftBtn = $('spinPanLeftBtn');
  const panRightBtn = $('spinPanRightBtn');
  const scrollWrap = $('spinChartScrollWrap');
  const scroller = $('spinChartScroller');

  if (!n) {
    if (hint) hint.textContent = CHART_DEFAULT_HINT;
    [zoomInBtn, zoomOutBtn, resetBtn, panLeftBtn, panRightBtn].forEach((btn) => {
      if (btn) btn.disabled = true;
    });
    if (scrollWrap) scrollWrap.classList.add('hidden');
    return;
  }

  const visible = chartWindowSize();
  const fullyZoomedOut = chartViewStart <= 0.001 && chartViewEnd >= n - 1 - 0.001;
  const canPan = !fullyZoomedOut;
  const displayStart = Math.floor(chartViewStart) + 1;
  const displayEnd = Math.min(n, Math.ceil(chartViewEnd) + 1);

  if (hint) {
    hint.textContent = fullyZoomedOut
      ? CHART_DEFAULT_HINT
      : 'Spins ' + fmtInt(displayStart) + '–' + fmtInt(displayEnd) + ' of ' + fmtInt(n);
  }
  if (zoomInBtn) zoomInBtn.disabled = visible <= minChartWindow(n);
  if (zoomOutBtn) zoomOutBtn.disabled = fullyZoomedOut;
  if (resetBtn) resetBtn.disabled = fullyZoomedOut;
  if (panLeftBtn) panLeftBtn.disabled = !canPan || chartViewStart <= 0.001;
  if (panRightBtn) panRightBtn.disabled = !canPan || chartViewEnd >= n - 1 - 0.001;

  if (scrollWrap) scrollWrap.classList.toggle('hidden', !canPan);
  if (scroller && canPan) {
    scroller.min = '0';
    scroller.max = String(Math.max(0, n - visible));
    scroller.step = '1';
    if (syncScroller && !chartScrollDragging && document.activeElement !== scroller) {
      scroller.value = String(Math.round(chartViewStart));
    }
  }
}

function panSpinChart(direction) {
  const n = activeChartSpins.length;
  if (!n) return;
  const visible = chartWindowSize();
  if (visible >= n) return;
  const step = Math.max(1, Math.floor(visible * 0.25));
  animateChartToStart(chartViewStart + (direction < 0 ? -step : step));
}

function onSpinChartScrollerInput() {
  const scroller = $('spinChartScroller');
  const n = activeChartSpins.length;
  if (!scroller || !n) return;
  if (chartWindowSize() >= n) return;
  chartScrollDragging = true;
  animateChartToStart(Number(scroller.value) || 0);
}

function onSpinChartScrollerEnd() {
  chartScrollDragging = false;
  if (chartSmoothTargetStart != null) {
    animateChartToStart(chartSmoothTargetStart);
  } else {
    updateSpinZoomControls({ syncScroller: true });
  }
}

function zoomSpinChart(factor, anchorRatio = 0.5) {
  stopChartSmoothPan(true);
  const n = activeChartSpins.length;
  if (!n) return;
  const visible = chartWindowSize();
  const nextVisible = Math.round(visible * factor);
  const anchor = chartViewStart + anchorRatio * (visible - 1);
  const half = (nextVisible - 1) / 2;
  const clamped = clampChartView(anchor - half, anchor + half, n);
  chartViewStart = clamped.start;
  chartViewEnd = clamped.end;
  updateSpinZoomControls();
  hideSpinChartTooltip();
  renderSpinChart(activeChartSpins, hoveredSpinIndex);
}

/** Draw a polyline through each visible spin's win amount. */
function traceWinLine(ctx, visibleSpins, xCenter, yAt) {
  visibleSpins.forEach((spin, i) => {
    const x = xCenter(i);
    const y = yAt(spin.winAmount);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

function strokeMarker(ctx, x, y, radius, fill, stroke, lineWidth) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function renderSpinChart(spins, hoverIndex = -1) {
  const canvas = $('spinChart');
  if (!canvas || !Array.isArray(spins) || !spins.length || canvas.offsetParent === null) return;

  const n = spins.length;
  const windowSize = Math.max(1, Math.min(n, chartWindowSize()));
  if (!Number.isFinite(chartViewStart) || !Number.isFinite(chartViewEnd) || chartViewEnd < chartViewStart) {
    chartViewStart = 0;
    chartViewEnd = n - 1;
  }
  if (chartViewStart < 0) chartViewStart = 0;
  if (chartViewEnd > n - 1) {
    chartViewEnd = n - 1;
    chartViewStart = Math.max(0, chartViewEnd - windowSize + 1);
  }

  const width = Math.max(canvas.parentElement.clientWidth - 32, 320);
  const height = CHART_HEIGHT;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const pad = { ...CHART_PADDING };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const baseY = pad.top + plotH;

  // Fractional start enables smooth slider pan between whole spins.
  const viewStartExact = chartViewStart;
  const viewEndExact = chartViewStart + windowSize - 1;
  const floorStart = Math.max(0, Math.floor(viewStartExact));
  const ceilEnd = Math.min(n - 1, Math.ceil(viewEndExact));
  const visibleSpins = spins.slice(floorStart, ceilEnd + 1);
  const visibleCount = visibleSpins.length;
  if (!visibleCount) return;

  const bets = visibleSpins.map((s) => Number(s.betAmount || 0));
  const wins = visibleSpins.map((s) => Number(s.winAmount || 0));
  const maxValue = Math.max(1, ...bets, ...wins) * 1.08;
  const slotW = plotW / windowSize;
  const barW = Math.max(2, Math.min(18, slotW * 0.42));
  const shiftX = -(viewStartExact - floorStart) * slotW;
  const xCenter = (localIndex) => pad.left + (localIndex + 0.5) * slotW + shiftX;
  const yAt = (value) => pad.top + plotH - (Number(value || 0) / maxValue) * plotH;

  // Plot background and horizontal grid with $ labels
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  ctx.fillRect(pad.left, pad.top, plotW, plotH);

  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = '#8b9bb0';
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (plotH * i / 4);
    const value = maxValue * (1 - i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText('$' + fmtCompact(value), pad.left - 8, y + 3);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, plotW, plotH + 8);
  ctx.clip();

  // Bet bars — amber for free spins, blue for paid
  visibleSpins.forEach((spin, i) => {
    const cx = xCenter(i);
    const bet = Number(spin.betAmount || 0);
    const betY = yAt(bet);
    const active = floorStart + i === hoverIndex;
    if (isSpinFree(spin)) {
      ctx.fillStyle = active ? 'rgba(255, 193, 7, 0.95)' : 'rgba(255, 193, 7, 0.7)';
      if (bet > 0) {
        ctx.fillRect(cx - barW / 2, betY, barW, baseY - betY);
      } else {
        const markerH = Math.max(6, Math.min(12, barW + 2));
        ctx.fillRect(cx - barW / 2, baseY - markerH, barW, markerH);
      }
    } else {
      ctx.fillStyle = active ? 'rgba(66, 165, 245, 0.95)' : 'rgba(66, 165, 245, 0.55)';
      ctx.fillRect(cx - barW / 2, betY, barW, baseY - betY);
    }
  });

  // Win area + line, with dots on free spins
  ctx.beginPath();
  traceWinLine(ctx, visibleSpins, xCenter, yAt);
  ctx.lineTo(xCenter(visibleCount - 1), baseY);
  ctx.lineTo(xCenter(0), baseY);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, baseY);
  grad.addColorStop(0, 'rgba(102, 187, 106, 0.28)');
  grad.addColorStop(1, 'rgba(102, 187, 106, 0.02)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  traceWinLine(ctx, visibleSpins, xCenter, yAt);
  ctx.strokeStyle = 'rgba(102, 187, 106, 0.95)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  visibleSpins.forEach((spin, i) => {
    if (!isSpinFree(spin)) return;
    strokeMarker(ctx, xCenter(i), yAt(spin.winAmount), 3.5, '#ffc107', 'rgba(12, 18, 27, 0.9)', 1.2);
  });

  // Hover guide line and bet/win markers
  if (hoverIndex >= floorStart && hoverIndex <= ceilEnd) {
    const spin = spins[hoverIndex];
    const free = isSpinFree(spin);
    const cx = xCenter(hoverIndex - floorStart);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, pad.top);
    ctx.lineTo(cx, baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    strokeMarker(ctx, cx, yAt(spin.betAmount), 4.5, free ? '#ffc107' : '#42a5f5', '#fff', 1.5);
    strokeMarker(ctx, cx, yAt(spin.winAmount), 5, free ? '#ffc107' : '#66bb6a', '#fff', 1.8);
  }
  ctx.restore();

  // X labels
  ctx.fillStyle = '#8b9bb0';
  ctx.textAlign = 'left';
  const firstLabel = 'Spin ' + fmtInt(Math.floor(viewStartExact) + 1);
  const lastLabel = 'Spin ' + fmtInt(Math.min(n, Math.ceil(viewEndExact) + 1));
  ctx.fillText(firstLabel, pad.left, height - 14);
  ctx.fillText(lastLabel, width - pad.right - ctx.measureText(lastLabel).width, height - 14);
  if (windowSize > 12) {
    const midGlobal = Math.round((viewStartExact + viewEndExact) / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Spin ' + fmtInt(midGlobal + 1), pad.left + plotW / 2, height - 14);
  }

  canvas._chartMeta = {
    spins,
    pad,
    plotW,
    plotH,
    slotW,
    width,
    height,
    viewStart: viewStartExact,
    viewEnd: viewEndExact,
    floorStart,
    windowSize,
    shiftX,
    xAt: (globalIdx) => xCenter(globalIdx - floorStart),
    yAt,
    localXAt: xCenter,
  };
  updateSpinZoomControls({ syncScroller: !chartScrollDragging && !chartSmoothRaf });
}

function spinIndexFromPointer(meta, x) {
  if (!meta?.spins?.length) return -1;
  const local = Math.floor((x - meta.pad.left - (meta.shiftX || 0)) / meta.slotW);
  if (local < 0 || local >= (meta.windowSize || 0)) return -1;
  const idx = (meta.floorStart || 0) + local;
  if (idx < 0 || idx >= meta.spins.length) return -1;
  return idx;
}

function tooltipRow(label, valueHtml) {
  return '<div class="chart-tooltip-row"><span>' + label + '</span><b>' + valueHtml + '</b></div>';
}

function updateSpinChartTooltip(e) {
  const canvas = $('spinChart');
  const tooltip = $('spinChartTooltip');
  const panel = canvas?.parentElement;
  const meta = canvas?._chartMeta;
  if (!canvas || !tooltip || !panel || !meta?.spins?.length) return;
  if (chartPanState) {
    show(tooltip, false);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (x < meta.pad.left || x > meta.width - meta.pad.right || y < meta.pad.top || y > meta.height - meta.pad.bottom) {
    if (hoveredSpinIndex !== -1) {
      hoveredSpinIndex = -1;
      renderSpinChart(meta.spins, -1);
    }
    show(tooltip, false);
    return;
  }

  const index = spinIndexFromPointer(meta, x);
  if (index < 0) {
    show(tooltip, false);
    return;
  }
  const spin = meta.spins[index];
  const pointX = meta.xAt(index);
  const pointY = Math.min(meta.yAt(spin.betAmount), meta.yAt(spin.winAmount));
  const hasJson = spinHasJson(spin);
  const createdAt = apiField(spin, 'createdAt');

  if (hoveredSpinIndex !== index) {
    hoveredSpinIndex = index;
    renderSpinChart(meta.spins, index);
    syncSpinViewJsonButton();
  }

  tooltip.classList.toggle('has-json-action', hasJson);
  tooltip.innerHTML =
    '<strong>Spin ' + escHtml(apiField(spin, 'spinIndex', index + 1)) + '</strong>' +
    tooltipRow('Type', isSpinFree(spin) ? 'Free spin' : 'Paid spin') +
    tooltipRow('Bet', '$' + escHtml(fmtMoney(apiField(spin, 'betAmount')))) +
    tooltipRow('Win', '$' + escHtml(fmtMoney(apiField(spin, 'winAmount')))) +
    tooltipRow('Balance', '$' + escHtml(fmtMoney(apiField(spin, 'balanceAfter')))) +
    tooltipRow('Time (UTC)', escHtml(formatDateTimeUtc(createdAt))) +
    tooltipRow('Time (US)', escHtml(formatDateTimeUs(createdAt))) +
    tooltipRow('Time (' + DISPLAY_TZ_LABEL + ')', escHtml(formatDateTime(createdAt))) +
    tooltipRow('JSON', hasJson ? 'Available' : 'None') +
    (hasJson
      ? '<button type="button" class="icon-btn json-btn" data-chart-spin-json="' + escAttr(spinId(spin)) +
        '" data-tip="Open spin response JSON" aria-label="Open spin JSON">i</button>'
      : '');

  const tipW = tooltip.offsetWidth || 190;
  const tipH = tooltip.offsetHeight || 110;
  const panelW = panel.clientWidth;
  const left = Math.max(tipW / 2 + 8, Math.min(panelW - tipW / 2 - 8, pointX));
  const top = Math.max(tipH + 8, Math.min(pointY, y) - 8);
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  tooltip.style.right = 'auto';
  show(tooltip, true);
}

function syncSpinViewJsonButton() {
  const btn = $('spinViewJsonBtn');
  if (!btn) return;
  const spin = hoveredSpinIndex >= 0 ? activeChartSpins[hoveredSpinIndex] : null;
  const hasJson = spinHasJson(spin);
  btn.disabled = !hasJson;
  btn.dataset.tip = hasJson
    ? 'Open response JSON for spin ' + apiField(spin, 'spinIndex', hoveredSpinIndex + 1)
    : 'Hover a spin that has response_json, then click';
}

function openHoveredChartSpinJson() {
  if (hoveredSpinIndex < 0 || hoveredSpinIndex >= activeChartSpins.length) return;
  openChartSpinJson(activeChartSpins[hoveredSpinIndex]);
}

function onSpinChartClick(e) {
  if (chartPanState || chartSuppressClick) {
    chartSuppressClick = false;
    return;
  }
  const canvas = $('spinChart');
  const meta = canvas?._chartMeta;
  if (!canvas || !meta?.spins?.length) return;
  const rect = canvas.getBoundingClientRect();
  const index = spinIndexFromPointer(meta, e.clientX - rect.left);
  if (index < 0) return;
  hoveredSpinIndex = index;
  syncSpinViewJsonButton();
  openChartSpinJson(meta.spins[index]);
}

function hideSpinChartTooltip() {
  const tooltip = $('spinChartTooltip');
  if (tooltip) {
    show(tooltip, false);
    tooltip.classList.remove('has-json-action');
  }
  if (hoveredSpinIndex !== -1) {
    hoveredSpinIndex = -1;
    if (activeChartSpins.length) renderSpinChart(activeChartSpins, -1);
  }
  syncSpinViewJsonButton();
}

function onSpinChartWheel(e) {
  const canvas = $('spinChart');
  const meta = canvas?._chartMeta;
  if (!meta?.spins?.length) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const plotLeft = meta.pad.left;
  const plotRight = meta.width - meta.pad.right;
  const ratio = x <= plotLeft ? 0 : x >= plotRight ? 1 : (x - plotLeft) / (plotRight - plotLeft);
  zoomSpinChart(e.deltaY < 0 ? 0.72 : 1.38, ratio);
}

function onSpinChartPointerDown(e) {
  const canvas = $('spinChart');
  const meta = canvas?._chartMeta;
  if (!meta?.spins?.length || e.button !== 0) return;
  if (chartWindowSize() >= meta.spins.length) return;
  stopChartSmoothPan(true);
  chartSuppressClick = false;
  chartPanState = {
    startX: e.clientX,
    originStart: chartViewStart,
    originEnd: chartViewEnd,
    slotW: meta.slotW,
  };
  canvas.classList.add('is-panning');
  hideSpinChartTooltip();
  e.preventDefault();
}

function onSpinChartPointerMove(e) {
  if (!chartPanState) {
    updateSpinChartTooltip(e);
    return;
  }
  const deltaPx = e.clientX - chartPanState.startX;
  if (Math.abs(deltaPx) > 4) chartSuppressClick = true;
  const windowSize = chartPanState.originEnd - chartPanState.originStart + 1;
  const fitted = fitChartWindow(
    chartPanState.originStart - deltaPx / chartPanState.slotW,
    windowSize,
    activeChartSpins.length - 1
  );
  if (Math.abs(fitted.start - chartViewStart) > 0.001 || Math.abs(fitted.end - chartViewEnd) > 0.001) {
    chartViewStart = fitted.start;
    chartViewEnd = fitted.end;
    updateSpinZoomControls({ syncScroller: true });
    renderSpinChart(activeChartSpins, -1);
  }
}

function onSpinChartPointerUp() {
  $('spinChart')?.classList.remove('is-panning');
  chartPanState = null;
}

function openTooltipSpinJson(e) {
  const btn = e.target.closest('[data-chart-spin-json]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const id = btn.getAttribute('data-chart-spin-json') || '';
  const spin = activeChartSpins.find((s) => String(spinId(s)) === id)
    || (hoveredSpinIndex >= 0 ? activeChartSpins[hoveredSpinIndex] : null);
  if (spin) openChartSpinJson(spin);
}

function bindSpinChartEvents() {
  $('spinZoomInBtn').addEventListener('click', () => zoomSpinChart(0.65, 0.5));
  $('spinZoomOutBtn').addEventListener('click', () => zoomSpinChart(1.45, 0.5));
  $('spinZoomResetBtn').addEventListener('click', () => resetSpinChartZoom());
  $('spinDownloadReportBtn').addEventListener('click', () => downloadSessionSpinReport());
  $('spinViewJsonBtn')?.addEventListener('click', () => openHoveredChartSpinJson());
  $('spinPanLeftBtn').addEventListener('click', () => panSpinChart(-1));
  $('spinPanRightBtn').addEventListener('click', () => panSpinChart(1));

  const scroller = $('spinChartScroller');
  scroller.addEventListener('input', onSpinChartScrollerInput);
  ['change', 'mouseup', 'touchend'].forEach((type) => scroller.addEventListener(type, onSpinChartScrollerEnd));

  const canvas = $('spinChart');
  canvas.addEventListener('mousemove', onSpinChartPointerMove);
  canvas.addEventListener('mousedown', onSpinChartPointerDown);
  canvas.addEventListener('click', onSpinChartClick);
  canvas.addEventListener('mouseleave', () => {
    onSpinChartPointerUp();
    // Keep the tooltip while the pointer moves onto it (JSON button).
    const tip = $('spinChartTooltip');
    if (tip && !tip.classList.contains('hidden') && tip.matches(':hover')) return;
    hideSpinChartTooltip();
  });
  $('spinChartTooltip')?.addEventListener('mouseleave', () => hideSpinChartTooltip());
  $('spinChartTooltip')?.addEventListener('click', openTooltipSpinJson);
  window.addEventListener('mouseup', onSpinChartPointerUp);
  canvas.addEventListener('wheel', onSpinChartWheel, { passive: false });
}

// ---- Session report ----

// Downloadable standalone HTML report for the session open in the spin graph.

function safeReportFilename(parts) {
  return parts
    .map((p) => String(p || 'report').trim())
    .join('_')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

function buildSessionSpinReportHtml(session, spins) {
  const rows = Array.isArray(spins) ? spins : [];
  const totalBet = sumBy(rows, 'betAmount');
  const totalWin = sumBy(rows, 'winAmount');
  const rtp = totalBet ? rtpRatio(totalBet, totalWin) : rowRtp(session);
  const freeCount = rows.filter(isSpinFree).length;
  const paidCount = rows.length - freeCount;
  const profit = totalWin - totalBet;
  const biggestWin = rows.reduce((best, s) => {
    if (!best || Number(s.winAmount || 0) > Number(best.winAmount || 0)) return s;
    return best;
  }, null);
  const balanceRows = rows.filter((s) => s.balanceAfter != null && Number.isFinite(Number(s.balanceAfter)));
  const maxBalance = balanceRows.reduce((best, s) =>
    (!best || Number(s.balanceAfter) > Number(best.balanceAfter) ? s : best), null);
  const minBalance = balanceRows.reduce((best, s) =>
    (!best || Number(s.balanceAfter) < Number(best.balanceAfter) ? s : best), null);
  const firstSpin = balanceRows[0] || null;
  const lastSpin = balanceRows[balanceRows.length - 1] || null;
  let startBalance = null;
  if (firstSpin) {
    const before = firstSpin.balanceBefore ?? firstSpin.BalanceBefore;
    startBalance = before != null && Number.isFinite(Number(before))
      ? Number(before)
      : Number(firstSpin.balanceAfter) - Number(firstSpin.winAmount || 0) +
        (isSpinFree(firstSpin) ? 0 : Number(firstSpin.betAmount || 0));
  }
  const endBalance = lastSpin ? Number(lastSpin.balanceAfter) : null;

  const plainSummary = [
    'Player ' + (session?.username || 'Unknown') + ' played ' + (session?.gameName || 'Unknown game') + '.',
    'This session had ' + rows.length + ' spins (' + paidCount + ' paid, ' + freeCount + ' free).',
    'Total bet was $' + fmtMoney(totalBet) + ' and total win was $' + fmtMoney(totalWin) + '.',
    'Session RTP is ' + fmtRtp(rtp) + ' (' + (profit >= 0 ? 'player ahead' : 'player behind') + ' by $' + fmtMoney(Math.abs(profit)) + ').',
    biggestWin
      ? 'Biggest win was $' + fmtMoney(biggestWin.winAmount) + ' on spin ' + fmtInt(biggestWin.spinIndex) +
        (isSpinFree(biggestWin) ? ' (free spin).' : ' (paid spin).')
      : '',
    maxBalance
      ? 'Highest balance was $' + fmtMoney(maxBalance.balanceAfter) + ' on spin ' + fmtInt(maxBalance.spinIndex) +
        ' and lowest balance was $' + fmtMoney(minBalance.balanceAfter) + ' on spin ' + fmtInt(minBalance.spinIndex) + '.'
      : '',
    startBalance != null
      ? 'Balance at session start was $' + fmtMoney(startBalance) + ' and at session end was $' + fmtMoney(endBalance) + '.'
      : '',
  ].filter(Boolean).join(' ');

  const spinRowsHtml = rows.map((s) => {
    const free = isSpinFree(s);
    const cls = [free ? 'free' : 'paid'];
    if (s === maxBalance) cls.push('bal-max');
    if (s === minBalance) cls.push('bal-min');
    return '<tr class="' + cls.join(' ') + '">' +
      '<td>' + escHtml(fmtInt(s.spinIndex)) + '</td>' +
      '<td>' + (free ? 'Free' : 'Paid') + '</td>' +
      '<td>$' + escHtml(fmtMoney(s.betAmount)) + '</td>' +
      '<td>$' + escHtml(fmtMoney(s.winAmount)) + '</td>' +
      '<td>$' + escHtml(fmtMoney(s.balanceAfter)) + '</td>' +
      '<td>' + escHtml(formatDateTime(s.createdAt)) + '</td>' +
      '</tr>';
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Session Spin Report — ${escHtml(session?.username || '')} — ${escHtml(session?.gameName || '')}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: Segoe UI, Arial, sans-serif; margin: 0; padding: 28px; color: #152033; background: #f5f7fb; }
    .wrap { max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #dbe3ef; border-radius: 14px; padding: 28px; }
    h1 { margin: 0 0 6px; font-size: 1.45rem; }
    .sub { color: #5b6b81; margin-bottom: 18px; font-size: 0.95rem; }
    .summary { background: #eef5ff; border: 1px solid #cfe0ff; border-radius: 12px; padding: 14px 16px; line-height: 1.5; margin-bottom: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 18px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
    .card span { display: block; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .card strong { font-size: 1.05rem; }
    .bet { color: #1565c0; }
    .win { color: #2e7d32; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e6edf5; }
    th { background: #f1f5f9; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
    tr.free td:nth-child(2) { color: #b8860b; font-weight: 600; }
    tr.paid td:nth-child(2) { color: #1565c0; font-weight: 600; }
    .bal-hi { color: #2e7d32; }
    .bal-lo { color: #c62828; }
    .card small { display: block; color: #64748b; font-size: 0.78rem; margin-top: 2px; }
    tr.bal-max td { background: #e8f5e9; }
    tr.bal-min td { background: #ffebee; }
    tr.bal-max td:nth-child(5) { color: #2e7d32; font-weight: 700; }
    tr.bal-min td:nth-child(5) { color: #c62828; font-weight: 700; }
    @media print { body { background: #fff; padding: 0; } .wrap { border: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Session Spin Report</h1>
    <div class="sub">
      ${escHtml(session?.username || 'Unknown user')} · ${escHtml(session?.gameName || 'Unknown game')}<br/>
      Started: ${escHtml(formatDateTime(session?.startedAt))}${lastSpin ? '<br/>Ended: ' + escHtml(formatDateTime(lastSpin.createdAt)) : ''}
    </div>

    <div class="summary">${escHtml(plainSummary)}</div>

    <div class="grid">
      <div class="card"><span>Start Balance</span><strong>${startBalance != null ? '$' + escHtml(fmtMoney(startBalance)) : '—'}</strong>${firstSpin ? '<small>' + escHtml(formatDateTime(firstSpin.createdAt)) + '</small>' : ''}</div>
      <div class="card"><span>End Balance</span><strong>${endBalance != null ? '$' + escHtml(fmtMoney(endBalance)) : '—'}</strong>${lastSpin ? '<small>' + escHtml(formatDateTime(lastSpin.createdAt)) + '</small>' : ''}</div>
      <div class="card"><span>Total Bet</span><strong class="bet">$${escHtml(fmtMoney(totalBet))}</strong></div>
      <div class="card"><span>Total Win</span><strong class="win">$${escHtml(fmtMoney(totalWin))}</strong></div>
      <div class="card"><span>Session RTP</span><strong>${escHtml(fmtRtp(rtp))}</strong></div>
      <div class="card"><span>Net</span><strong>${profit >= 0 ? '+' : '-'}$${escHtml(fmtMoney(Math.abs(profit)))}</strong></div>
      <div class="card"><span>Spins</span><strong>${escHtml(fmtInt(rows.length))}</strong></div>
      <div class="card"><span>Paid Spins</span><strong>${escHtml(fmtInt(paidCount))}</strong></div>
      <div class="card"><span>Free Spins</span><strong>${escHtml(fmtInt(freeCount))}</strong></div>
      <div class="card"><span>Max Balance</span><strong class="bal-hi">${maxBalance ? '$' + escHtml(fmtMoney(maxBalance.balanceAfter)) : '—'}</strong>${maxBalance ? '<small>on spin #' + escHtml(fmtInt(maxBalance.spinIndex)) + '</small>' : ''}</div>
      <div class="card"><span>Low Balance</span><strong class="bal-lo">${minBalance ? '$' + escHtml(fmtMoney(minBalance.balanceAfter)) : '—'}</strong>${minBalance ? '<small>on spin #' + escHtml(fmtInt(minBalance.spinIndex)) + '</small>' : ''}</div>
    </div>

    <h2 style="font-size:1.05rem;margin:0 0 10px;">Spin details</h2>
    <table>
      <thead>
        <tr>
          <th>Spin #</th>
          <th>Type</th>
          <th>Bet</th>
          <th>Win</th>
          <th>Balance After</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        ${spinRowsHtml || '<tr><td colspan="6">No spins.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function downloadSessionSpinReport() {
  const frame = currentDrillFrame();
  if (!frame || frame.type !== 'spins' || !frame.session) {
    setError('Open a session spin graph first, then download the report.');
    return;
  }
  const session = frame.session;
  const spins = session.spinLogs || activeChartSpins || [];
  const html = buildSessionSpinReportHtml(session, spins);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = fileTimestamp();
  a.href = url;
  a.download = safeReportFilename(['spin_report', session.username, session.gameName, stamp]) + '.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Report downloaded');
}

// ---- Spin JSON modal ----

// Spin response JSON modal, opened from the User Game Play spins table and the session spin graph.

let spinJsonRawText = '';

function closeSpinJsonModal() {
  const modal = $('ugpSpinJsonModal');
  if (modal) show(modal, false);
  spinJsonRawText = '';
}

function prettySpinJson(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object') {
    try { return JSON.stringify(raw, null, 2); } catch { return String(raw); }
  }
  const text = String(raw);
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function parseSpinJsonObject(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { return null; }
}

function renderSpinJsonSummary(meta, parsed) {
  const el = $('ugpSpinJsonSummary');
  if (!el) return;
  const totalWin = parsed?.TotalWin ?? parsed?.totalWin;
  const rng = parsed?.rngCategory ?? parsed?.RngCategory ?? '—';
  const free = parsed?.IsFreeSpin ?? parsed?.isFreeSpin;
  const reels = parsed?.Reels ?? parsed?.reels;
  const reelCount = Array.isArray(reels) ? reels.length : '—';
  const paylines = parsed?.PaylineWins ?? parsed?.paylineWins;
  const payCount = Array.isArray(paylines) ? paylines.length : 0;
  setHtml(el, [
    statHtml('Bet', '$' + fmtMoney(meta.betAmount), 'bet'),
    statHtml('Win', '$' + fmtMoney(meta.winAmount ?? totalWin), Number(meta.winAmount) > 0 ? 'up' : 'flat'),
    statHtml('RNG', escHtml(String(rng)), 'info'),
    statHtml('Reels', escHtml(String(reelCount))),
    statHtml('Paylines', fmtInt(payCount)),
    statHtml('Type', free ? 'Free' : 'Paid', free ? 'purple' : ''),
  ].join(''));
}

function showSpinJsonModal(meta, rawJson) {
  const modal = $('ugpSpinJsonModal');
  const view = $('ugpSpinJsonView');
  const metaEl = $('ugpSpinJsonMeta');
  if (!modal || !view) return;

  spinJsonRawText = prettySpinJson(rawJson) || String(rawJson || '');
  setText('ugpSpinJsonTitle', (meta.gameName || 'Spin') + ' · #' + (meta.spinIndex ?? '—'));
  if (metaEl) {
    metaEl.textContent = [
      meta.createdAt
        ? ('UTC: ' + formatDateTimeUtc(meta.createdAt) + ' · US: ' + formatDateTimeUs(meta.createdAt) +
          ' · ' + DISPLAY_TZ_LABEL + ': ' + formatDateTime(meta.createdAt))
        : '',
      meta.requestId ? 'Request ' + meta.requestId : '',
      meta.id ? 'Log ' + meta.id : '',
    ].filter(Boolean).join(' · ');
  }
  renderSpinJsonSummary(meta, parseSpinJsonObject(rawJson));
  view.textContent = spinJsonRawText || 'No response_json for this spin.';
  show(modal, true);
}

/** Modal header/summary fields for a spin log row (camelCase or PascalCase). */
function buildSpinMeta(row) {
  return {
    id: apiField(row, 'id', ''),
    gameName: apiField(row, 'gameName', ''),
    spinIndex: apiField(row, 'spinIndex', ''),
    createdAt: apiField(row, 'createdAt', ''),
    requestId: apiField(row, 'requestId', ''),
    betAmount: apiField(row, 'betAmount', 0),
    winAmount: apiField(row, 'winAmount', 0),
  };
}

/** Show the modal in a loading state, then fill it from GET /user-game-play/spins/{id}/json. */
async function fetchAndShowSpinJson(id, meta) {
  const view = $('ugpSpinJsonView');
  const modal = $('ugpSpinJsonModal');
  if (view) view.textContent = 'Loading…';
  if (modal) show(modal, true);
  setText('ugpSpinJsonTitle', 'Spin response JSON');
  setText('ugpSpinJsonMeta', 'Loading ' + id + '…');
  const summaryEl = $('ugpSpinJsonSummary');
  if (summaryEl) setHtml(summaryEl, '');

  try {
    const json = await fetchApiJson('/user-game-play/spins/' + encodeURIComponent(id) + '/json');
    const data = json.data || json.Data || {};
    showSpinJsonModal({
      id: apiField(data, 'id', id),
      gameName: apiField(data, 'gameName', meta.gameName),
      spinIndex: apiField(data, 'spinIndex', meta.spinIndex),
      createdAt: apiField(data, 'createdAt', meta.createdAt),
      requestId: apiField(data, 'requestId', meta.requestId),
      betAmount: apiField(data, 'betAmount', meta.betAmount),
      winAmount: apiField(data, 'winAmount', meta.winAmount),
    }, apiField(data, 'responseJson', null));
  } catch (err) {
    if (view) view.textContent = 'Failed to load JSON: ' + (err?.message || String(err));
  }
}

/** Open from the User Game Play spins table (`sourceIndex` points into userGameplaySpinsData). */
async function openSpinJsonFromTable(spinLogId, sourceIndex) {
  const row = userGameplaySpinsData[Number(sourceIndex)] || null;
  const meta = { ...buildSpinMeta(row), id: spinLogId || apiField(row, 'id', '') };

  if (isDemoMode()) {
    showSpinJsonModal(meta, row?._demoJson || null);
    return;
  }
  if (!spinLogId) {
    showSpinJsonModal(meta, null);
    return;
  }
  await fetchAndShowSpinJson(spinLogId, meta);
}

function getChartSpinGameName() {
  return currentDrillFrame()?.session?.gameName || '';
}

async function openChartSpinJson(spin) {
  if (!spin) return;
  const id = String(spinId(spin));
  const meta = { ...buildSpinMeta(spin), id, gameName: getChartSpinGameName() || 'Spin' };

  if (!id || !spinHasJson(spin)) {
    showSpinJsonModal(meta, null);
    return;
  }
  if (isDemoMode()) {
    showSpinJsonModal(meta, getDemoChartSpinJson(spin, meta));
    return;
  }
  await fetchAndShowSpinJson(id, meta);
}

async function copySpinJson() {
  const text = spinJsonRawText || $('ugpSpinJsonView')?.textContent || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const btn = $('ugpSpinJsonCopyBtn');
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = prev || 'Copy'; }, 1200);
    }
  } catch {
    // Clipboard unavailable or denied; nothing to report.
  }
}

function bindSpinJsonModalEvents() {
  $('ugpSpinJsonCloseBtn')?.addEventListener('click', () => closeSpinJsonModal());
  $('ugpSpinJsonCopyBtn')?.addEventListener('click', () => copySpinJson());
  $('ugpSpinJsonModal')?.addEventListener('click', (e) => {
    if (e.target === $('ugpSpinJsonModal')) closeSpinJsonModal();
  });
}
