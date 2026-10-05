// Entry point: wires the header / page-level controls, binds every feature, then loads data.
// Loaded last, after all core and feature scripts.

function resetDrillAndChart() {
  drillStack = [];
  activeChartSpins = [];
  resetSpinChartZoom(0, false);
}

function refreshNow() {
  resetRefreshTimer();
  loadData(false);
}

function bindHeaderEvents() {
  $('loadBtn').addEventListener('click', refreshNow);
  $('refreshTimer').addEventListener('click', refreshNow);
  $('homeBtn').addEventListener('click', () => goHome());
  $('maintenanceBtn')?.addEventListener('click', () => openMaintenancePage());
  $('userGameplayBtn')?.addEventListener('click', () => openUserGameplayPage());
  ['maintenanceHomeBtn', 'userGameplayHomeBtn'].forEach((id) => {
    $(id)?.addEventListener('click', () => goHome());
  });
  $('refreshPageBtn').addEventListener('click', () => window.location.reload());
  $('pauseRefreshBtn').addEventListener('click', () => toggleRefreshPaused());
  $('dataSource').addEventListener('change', () => {
    resetDrillAndChart();
    clearLiveSamples();
    resetSyncInfo();
    resetRefreshTimer();
    if (isDemoMode()) clearResponseHistory();
    loadData(false);
  });
  $('responseHistory').addEventListener('change', () => {
    resetDrillAndChart();
    showHistoryAt(Number($('responseHistory').value));
  });
  $('toggleJsonBtn').addEventListener('click', () => toggleJsonCard());
  $('toggleDiffBtn').addEventListener('click', () => toggleDiffView());
  $('fetchErrorClose')?.addEventListener('click', () => setError(''));
}

/** The button a table row stands for: clicking anywhere on the row runs it. */
const ROW_ACTION_SELECTOR = '[data-drill]:not([disabled]), [data-ugp-daily-spins], [data-maint-edit], [data-ugp-spin-json]:not([disabled]), [data-reward-user]';

function handleRowClick(e) {
  if (e.target.closest('button, a, input, select, label, textarea')) return false;
  if (window.getSelection()?.toString()) return false;
  const action = e.target.closest('tbody tr')?.querySelector(ROW_ACTION_SELECTOR);
  if (!action) return false;
  action.click();
  return true;
}

/** Delegated clicks / keys for content rendered inside #dashboard (KPI cards, graph buttons, …). */
function bindDashboardDelegation() {
  const dashboard = $('dashboard');
  dashboard.addEventListener('click', (e) => {
    if (handleExploreTableClick(e)) return;
    const explore = e.target.closest('[data-explore]');
    if (explore) {
      openExplorerFromButton(explore);
      return;
    }
    const ownerTx = e.target.closest('[data-owner-tx]');
    if (ownerTx) {
      if (!isDrillLoading) openOwnerTransactions(ownerTx.dataset.ownerTx);
      return;
    }
    if (e.target.closest('[data-nav="user-gameplay"]')) {
      openUserGameplayPage();
      return;
    }
    const gpSort = e.target.closest('[data-gp-sort]');
    if (gpSort) {
      setGamePerfSort(gpSort.dataset.gpSort);
      return;
    }
    const ugpUserBtn = e.target.closest('[data-ugp-use-userid]');
    if (ugpUserBtn) {
      useUserIdFromSummary(ugpUserBtn);
      return;
    }
    const crumb = e.target.closest('[data-crumb]');
    if (crumb) {
      popDrillTo(Number(crumb.dataset.crumb));
      return;
    }
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      setExplorerTab(tab.dataset.tab, { scroll: !tab.closest('#sectionNav') });
      return;
    }
    const kpi = e.target.closest('[data-kpi]');
    if (kpi && !isDrillLoading) {
      openKpi(kpi.dataset.kpi);
      return;
    }
    const button = e.target.closest('[data-drill]');
    if (button) {
      if (!button.disabled && !isDrillLoading) handleDrillClick(button);
      return;
    }
    handleRowClick(e);
  });
  dashboard.addEventListener('keydown', (e) => {
    if (e.target?.id === 'ownerTxPageJump' && e.key === 'Enter') {
      e.preventDefault();
      jumpOwnerTransactionsPage(e.target.value);
    }
  });
  $('gpFilter')?.addEventListener('change', (e) => setGamePerfFilter(e.target.value));
  $('drillBackBtn').addEventListener('click', () => closeDrillFrame());
  $('drillUpdateBtn').addEventListener('click', () => applyPendingDrillRows());
}

function bindWindowEvents() {
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      syncStickyHeaderOffset();
      placeExplorerTabIndicator(false);
      if (currentDrillFrame()?.type === 'spins') {
        hideSpinChartTooltip();
        renderSpinChart(activeChartSpins);
      }
    });
  });
  syncStickyHeaderOffset();
  const stickyHeaderEl = document.querySelector('.app-header');
  if (stickyHeaderEl && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => syncStickyHeaderOffset()).observe(stickyHeaderEl);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isConfirmOpen()) {
      closeConfirm();
      return;
    }
    if (!$('ugpSpinJsonModal')?.classList.contains('hidden')) {
      closeSpinJsonModal();
      return;
    }
    const typing = e.target.closest?.('input, select, textarea');
    if (!typing && drillStack.length && !isDrillLoading) closeDrillFrame();
  });

  document.addEventListener('visibilitychange', () => {
    isTabHidden = document.hidden;
    updateRefreshTimer();
    renderSyncStatus();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      isDiffVisible = false;
      clearResponseHistory();
      loadData(false);
    }
  });
}

function initPage() {
  document.querySelectorAll('.display-tz-label').forEach((el) => { el.textContent = DISPLAY_TZ_LABEL; });
  clearResponseHistory();
  setDefaultFeedbackDateFilter();
  updateFeedbackFilterHint();
  startTimezoneClock();
  updateDataSourceUi();
  startRefreshClock();
  loadData(false);
}

bindTooltips();
bindConfirmEvents();
bindHeaderEvents();
bindMaintenanceEvents();
bindRtpTableEvents();
bindFeedbackEvents();
bindDashboardDelegation();
bindOwnerTransactionEvents();
bindRewardRecordEvents();
bindSpinChartEvents();
bindWindowEvents();
bindUserGameplayEvents();
bindSpinJsonModalEvents();
initPage();
