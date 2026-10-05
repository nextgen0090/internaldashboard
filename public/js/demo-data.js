// Sample data used when "Data source" is set to Demo (no API calls).

const DEMO_SPIN_LOGS = [
  { spinIndex: 1, betAmount: 1, winAmount: 0 },
  { spinIndex: 2, betAmount: 1, winAmount: 2.5 },
  { spinIndex: 3, betAmount: 2, winAmount: 0.5 },
  { spinIndex: 4, betAmount: 1, winAmount: 1 },
  { spinIndex: 5, betAmount: 2, winAmount: 3 },
];

const DEMO_SUMMARY = {
  success: true,
  message: 'Demo data — not from API',
  data: {
    totalRecharged: 125430.50,
    totalRedeemed: 98210.25,
    ownerTotalRecharged: 210500.00,
    ownerTotalRedeemed: 155300.75,
    ownerTotalGenerated: 50000.00,
    totalUsers: 1842,
    totalGameUsers: {
      count: 2,
      users: [
        {
          userId: 'u1111111-1111-1111-1111-111111111101',
          username: 'player_alpha',
          gameId: 'g1111111-1111-1111-1111-111111111101',
          gameName: 'Lucky Slots',
        },
        {
          userId: 'u2222222-2222-2222-2222-222222222202',
          username: 'player_beta',
          gameId: 'g2222222-2222-2222-2222-222222222202',
          gameName: 'Ocean King',
        },
      ],
    },
    wholeGameRtp: { totalBet: 890120.00, totalWin: 801108.00, rtp: 0.90 },
    rtpByGame: [
      {
        gameId: 'g1111111-1111-1111-1111-111111111101',
        gameName: 'Lucky Slots',
        totalBet: 320000,
        totalWin: 288000,
        totalSpin: 15420,
        rtp: 0.90,
        targetRtp: 0.92,
        users: [
          {
            userId: 'u1111111-1111-1111-1111-111111111101',
            username: 'player_alpha',
            totalBet: 7,
            totalWin: 6.5,
            totalSpin: 5,
            rtp: 0.9286,
            sessions: [
              {
                sessionId: 'a1111111-1111-1111-1111-111111111101',
                userId: 'u1111111-1111-1111-1111-111111111101',
                username: 'player_alpha',
                gameId: 'g1111111-1111-1111-1111-111111111101',
                gameName: 'Lucky Slots',
                totalBet: 7,
                totalWin: 6.5,
                totalSpin: 5,
                rtp: 0.9286,
                startedAt: '2026-07-14T10:00:00Z',
                endedAt: '2026-07-14T10:05:00Z',
                spinLogs: DEMO_SPIN_LOGS,
              },
            ],
          },
        ],
      },
      { gameId: 'g1111111-1111-1111-1111-111111111102', gameName: 'Dragon Spin', totalBet: 210500, totalWin: 199975, totalSpin: 9820, rtp: 0.95, targetRtp: 0.93, users: [] },
      { gameId: 'g1111111-1111-1111-1111-111111111103', gameName: 'Vault Poker', totalBet: 180000, totalWin: 153000, totalSpin: 4200, rtp: 0.85, targetRtp: 0.90, users: [] },
      { gameId: 'g1111111-1111-1111-1111-111111111104', gameName: 'Mega Wheel', totalBet: 179620, totalWin: 160133, totalSpin: 11200, rtp: 0.8915, targetRtp: 0.88, users: [] },
    ],
    rtpByUser: [
      {
        userId: 'u1111111-1111-1111-1111-111111111101',
        username: 'player_alpha',
        totalBet: 45000,
        totalWin: 40500,
        totalSpin: 2100,
        rtp: 0.90,
        sessions: [
          {
            sessionId: 'a1111111-1111-1111-1111-111111111101',
            userId: 'u1111111-1111-1111-1111-111111111101',
            username: 'player_alpha',
            gameId: 'g1111111-1111-1111-1111-111111111101',
            gameName: 'Lucky Slots',
            totalBet: 7,
            totalWin: 6.5,
            totalSpin: 5,
            rtp: 0.9286,
            startedAt: '2026-07-14T10:00:00Z',
            endedAt: '2026-07-14T10:05:00Z',
            spinLogs: DEMO_SPIN_LOGS,
          },
        ],
      },
      { userId: 'u1111111-1111-1111-1111-111111111102', username: 'high_roller_99', totalBet: 120000, totalWin: 125400, totalSpin: 890, rtp: 1.045, sessions: [] },
      { userId: 'u1111111-1111-1111-1111-111111111103', username: 'casual_joe', totalBet: 8500, totalWin: 6800, totalSpin: 420, rtp: 0.80, sessions: [] },
    ],
    // Same rule as the API: rtpByGame rows with bet > 0 and rtp > targetRtp.
    gamesAboveTargetRtp: [
      { gameId: 'g1111111-1111-1111-1111-111111111102', gameName: 'Dragon Spin', totalBet: 210500, totalWin: 199975, totalSpin: 9820, rtp: 0.95, targetRtp: 0.93 },
      { gameId: 'g1111111-1111-1111-1111-111111111104', gameName: 'Mega Wheel', totalBet: 179620, totalWin: 160133, totalSpin: 11200, rtp: 0.8915, targetRtp: 0.88 },
    ],
    usersRtpAboveOrEqualOne: [
      { userId: 'u1111111-1111-1111-1111-111111111102', username: 'high_roller_99', totalBet: 120000, totalWin: 125400, totalSpin: 890, rtp: 1.045 },
    ],
    gamesTargetRtp: [
      { gameName: 'Lucky Slots', title: '', targetRtp: 0.92 },
      { gameName: 'Dragon Spin', title: 'hot', targetRtp: 0.93 },
      { gameName: 'Vault Poker', title: 'new', targetRtp: 0.90 },
      { gameName: 'Mega Wheel', title: 'coming soon', targetRtp: 0.88 },
    ],
    userFeedbacks: [
      {
        userId: '53935c4c-8511-4acf-a030-7bd263b7355d',
        username: 'g291sheshe',
        feedBackCount: 2,
        avgRating: 3.5,
        feedbacks: [
          { ratingStar: 4, message: 'Love it', createdAt: '2026-07-10T14:32:15.1234567Z' },
          { ratingStar: 3, message: 'Good', createdAt: '2026-07-08T09:15:42.9876543Z' },
        ],
      },
      {
        userId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        username: 'player_beta',
        feedBackCount: 1,
        avgRating: 2.0,
        feedbacks: [
          { ratingStar: 2, message: 'Too slow on mobile', createdAt: '2026-07-05T11:20:00Z' },
        ],
      },
      {
        userId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        username: 'casual_joe',
        feedBackCount: 3,
        avgRating: 4.0,
        feedbacks: [
          { ratingStar: 5, message: 'Fun slots', createdAt: '2026-07-11T18:45:00Z' },
          { ratingStar: 4, message: 'Nice UI', createdAt: '2026-07-11T19:10:00Z' },
          { ratingStar: 3, message: 'More bonuses please', createdAt: '2026-07-11T19:30:00Z' },
        ],
      },
    ],
  },
};

const DEMO_OWNER_TRANSACTIONS = [
  {
    type: 'Recharge', id: 'd1', ticket: 'T-1001', actor: 'cashier', account: 'player_alpha',
    date: '2026-07-23T10:00:00', amount: 100, before: 50, after: 150, currentCoin: 110, cashier: 'store1', remark: 'Demo top-up',
  },
  {
    type: 'Redeem', id: 'd2', ticket: 'T-1002', actor: 'cashier', account: 'player_alpha',
    date: '2026-07-22T16:30:00', amount: 40, before: 150, after: 110, currentCoin: 110, cashier: 'store1', remark: 'Demo cashout',
  },
  {
    type: 'Recharge', id: 'd3', ticket: 'T-1003', actor: 'player', account: 'player_beta',
    date: '2026-07-21T09:15:00', amount: 200, before: 0, after: 200, currentCoin: 125, cashier: 'owner', remark: '',
  },
  {
    type: 'Redeem', id: 'd4', ticket: 'T-1004', actor: 'cashier', account: 'player_beta',
    date: '2026-07-20T12:00:00', amount: 75, before: 200, after: 125, currentCoin: 125, cashier: 'store2', remark: '',
  },
  {
    type: 'Generated', id: 'd5', ticket: 'GC-1005', actor: 'owner', account: 'owner',
    date: '2026-07-19T08:00:00', amount: 5000, before: 0, after: 0, currentCoin: 50000, cashier: 'owner', remark: 'Demo coin generate',
  },
];

const DEMO_OWNER_TX_TYPES = {
  recharge: ['Recharge'],
  redeem: ['Redeem'],
  generated: ['Generated'],
  all: ['Recharge', 'Redeem'],
};

/** Mirrors the owner-transactions API: filter by type/account, then page. */
function getDemoOwnerTransactions({ type, page, pageSize, account }) {
  const types = DEMO_OWNER_TX_TYPES[type] || DEMO_OWNER_TX_TYPES.all;
  let rows = DEMO_OWNER_TRANSACTIONS.filter((r) => types.includes(r.type));
  if (account) {
    const q = account.toLowerCase();
    rows = rows.filter((r) => String(r.account || '').toLowerCase().includes(q));
  }
  const start = (Math.max(1, page) - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    totalCount: rows.length,
    page: Math.max(1, page),
    pageSize,
    type,
  };
}

const DEMO_SPIN_WHEEL_RECORDS = [
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    userId: '009d5079-5541-4492-8f65-ce65f1222d50',
    userName: 'dev',
    reward: 50,
    beforeBalance: 20.79,
    afterBalance: 70.79,
    createdAt: '2026-10-05T06:20:00',
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000002',
    userId: 'u1111111-1111-1111-1111-111111111101',
    userName: 'player_alpha',
    reward: 10,
    beforeBalance: 100,
    afterBalance: 110,
    createdAt: '2026-10-04T18:05:00',
  },
];

const DEMO_DAILY_REWARD_RECORDS = [
  {
    id: 'b2c3d4e5-0000-0000-0000-000000000002',
    userId: '009d5079-5541-4492-8f65-ce65f1222d50',
    userName: 'dev',
    coinsAwarded: 10,
    balanceBefore: 10.79,
    balanceAfter: 20.79,
    streakCount: 3,
    claimedAt: '2026-10-02T05:10:12',
  },
  {
    id: 'b2c3d4e5-0000-0000-0000-000000000001',
    userId: '009d5079-5541-4492-8f65-ce65f1222d50',
    userName: 'dev',
    coinsAwarded: 5,
    balanceBefore: 5.79,
    balanceAfter: 10.79,
    streakCount: 2,
    claimedAt: '2026-10-01T05:02:00',
  },
  {
    id: 'b2c3d4e5-0000-0000-0000-000000000003',
    userId: 'u1111111-1111-1111-1111-111111111101',
    userName: 'player_alpha',
    coinsAwarded: 100,
    balanceBefore: 40,
    balanceAfter: 140,
    streakCount: 1,
    claimedAt: '2026-09-28T08:00:00',
  },
];

/** Mirrors spin-wheel-records and daily-rewards: filter, then page. `dateKey` is the timestamp field. */
function pageDemoRewardRecords(rows, { userId, userName, from, to, page, pageSize, dateKey }) {
  let list = rows;
  if (userId) {
    const id = userId.toLowerCase();
    list = list.filter((r) => String(r.userId || '').toLowerCase() === id);
  }
  if (userName) {
    const q = userName.toLowerCase();
    list = list.filter((r) => String(r.userName || '').toLowerCase().includes(q));
  }
  if (from) list = list.filter((r) => String(r[dateKey] || '').slice(0, 10) >= from);
  if (to) list = list.filter((r) => String(r[dateKey] || '').slice(0, 10) <= to);
  const size = pageSize || 25;
  const start = (Math.max(1, page) - 1) * size;
  return {
    items: list.slice(start, start + size),
    totalCount: list.length,
    page: Math.max(1, page),
    pageSize: size,
    from: from || null,
    to: to || null,
  };
}

function getDemoSpinWheelRecords(query) {
  return pageDemoRewardRecords(DEMO_SPIN_WHEEL_RECORDS, { ...query, dateKey: 'createdAt' });
}

function getDemoDailyRewardRecords(query) {
  return pageDemoRewardRecords(DEMO_DAILY_REWARD_RECORDS, { ...query, dateKey: 'claimedAt' });
}

function getDemoMaintenanceSettings() {
  return ['Backend', 'Dashboard', 'Games'].map((maintenanceType) => ({
    maintenanceType, isMaintenance: false, startTime: null, endTime: null, updatedBy: 'demo',
  }));
}

function getDemoUserGameplay(userName) {
  return {
    userId: 'D74DE6FF-ADCB-48F5-B038-352B179D685E',
    summary: {
      userId: 'D74DE6FF-ADCB-48F5-B038-352B179D685E',
      userName: userName,
      totalBet: 158127.36,
      totalWin: 164532.40,
      totalRecharge: 10.00,
      totalRedeem: 1500.00,
      rtpPercentage: 104.05,
    },
    games: [
      { gameName: 'Mermaid', totalBet: 107086.20, totalWin: 86324.90, rtpPercentage: 80.61, totalSpins: 12646, totalFreeSpins: 0 },
      { gameName: 'Day Of Dead', totalBet: 12000, totalWin: 15000, rtpPercentage: 125, totalSpins: 500, totalFreeSpins: 6 },
    ],
  };
}

function getDemoUserGameplayDaily(userId) {
  return {
    userId: userId,
    userName: 'demo_user',
    rows: [
      { gameId: '937BFB14-422B-439F-9119-DF8CD7579585', gameName: 'Demo Game', date: '2026-07-21', bet: 2219.8, win: 7069.3, rtp: 3.184656, spins: 120 },
      { gameId: '937BFB14-422B-439F-9119-DF8CD7579585', gameName: 'Demo Game', date: '2026-07-22', bet: 16943.3, win: 38663.6, rtp: 2.28194, spins: 840 },
      { gameId: '937BFB14-422B-439F-9119-DF8CD7579585', gameName: 'Demo Game', date: '2026-07-23', bet: 10171.7, win: 15980.9, rtp: 1.571113, spins: 510 },
    ],
  };
}

function getDemoUserGameplaySpins(userId, from, gameId) {
  const items = [];
  for (let i = 1; i <= 12; i++) {
    const win = i % 3 === 0 ? 5 : 0;
    const isFreeSpin = i % 5 === 0;
    const hasResponseJson = i % 2 === 0;
    items.push({
      id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'),
      gameId: gameId || '937BFB14-422B-439F-9119-DF8CD7579585',
      gameName: 'Demo Game',
      requestId: 'req-demo-' + i,
      balanceBefore: 1000 + i * 10,
      betAmount: 1.2,
      winAmount: win,
      balanceAfter: 1000 + i * 10 - 1.2 + win,
      spinIndex: i,
      createdAt: (from || '2026-07-23') + 'T12:' + pad2(i) + ':00',
      isFreeSpin,
      hasResponseJson,
      _demoJson: hasResponseJson ? {
        Success: true,
        RequestId: 'req-demo-' + i,
        SpinId: 'spin-demo-' + i,
        TotalWin: win,
        IsFreeSpin: isFreeSpin,
        rngCategory: win ? 'Win' : 'NoWin',
        Reels: [[{ Id: 'BlueSeven' }], [{ Id: 'Empty' }], [{ Id: 'TripleSevenRedHot' }]],
        PaylineWins: [],
        NewBalance: 1000 + i * 10,
      } : null,
    });
  }
  return {
    userId,
    userName: 'demo_user',
    page: 1,
    pageSize: 50,
    totalCount: items.length,
    items,
  };
}

/** Fallback spin JSON for chart spins in demo mode that have no `_demoJson`. */
function getDemoChartSpinJson(spin, meta) {
  return spin._demoJson || {
    Success: true,
    SpinIndex: meta.spinIndex,
    TotalWin: meta.winAmount,
    IsFreeSpin: isSpinFree(spin),
    rngCategory: Number(meta.winAmount) > 0 ? 'Win' : 'NoWin',
  };
}
