// ══════════════════════════════════════════════════════════
//  IDX Analyzer Pro — JavaScript Application
// ══════════════════════════════════════════════════════════

// ── Config ─────────────────────────────────────────────────
const API_BASE = 'http://localhost:8000/api';

const TICKER_META = {
  IHSG: { label: '^JKSE',   base: 7142,  vol: 80  },
  BBCA: { label: 'BBCA.JK', base: 9875,  vol: 120 },
  BBRI: { label: 'BBRI.JK', base: 5200,  vol: 90  },
  TLKM: { label: 'TLKM.JK', base: 3560,  vol: 60  },
  ASII: { label: 'ASII.JK', base: 4800,  vol: 75  },
  GOTO: { label: 'GOTO.JK', base: 88,    vol: 6   },
  BMRI: { label: 'BMRI.JK', base: 7200,  vol: 95  },
  UNVR: { label: 'UNVR.JK', base: 2850,  vol: 45  },
};

const AVAILABLE_TICKERS = Object.keys(TICKER_META);
const PERIOD_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };

const COMPARE_COLORS = [
  '#3b82f6', '#34d399', '#fbbf24', '#f87171',
  '#8b5cf6', '#fb923c', '#22d3ee', '#f472b6',
];

// ── State ──────────────────────────────────────────────────
const state = {
  ticker: 'IHSG',
  period: '3M',
  indicators: { ma20: false, ma50: false, bb: false, sr: false },
  charts: { price: null, rsi: null, macd: null, compare: null },
  usingLiveData: false,
  compareTickers: [],
  compareDataCache: {},
  liveClockInterval: null,
  pollingInterval: null,
  theme: localStorage.getItem('idx-theme') || 'dark',
  lastPrices: [],
  lastLabels: [],
};

// ── Theme Management ───────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const moonIcon = document.getElementById('themeIconMoon');
  const sunIcon = document.getElementById('themeIconSun');
  if (moonIcon && sunIcon) {
    moonIcon.style.display = theme === 'dark' ? 'block' : 'none';
    sunIcon.style.display = theme === 'light' ? 'block' : 'none';
  }
  // Rebuild charts with new theme colors if data exists
  if (state.lastPrices.length > 0) {
    buildCharts(state.lastPrices, state.lastLabels);
  }
  if (state.compareTickers.length >= 2) {
    updateComparison();
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('idx-theme', state.theme);
  applyTheme(state.theme);
}

// ── Toast Notifications ────────────────────────────────────

let toastTimeout = null;

function showToast(msg, type = 'info', duration = 4000) {
  const el = document.getElementById('statusToast');
  if (!el) return;
  if (toastTimeout) clearTimeout(toastTimeout);

  el.textContent = msg;
  el.className = `toast toast--${type} toast--visible`;

  toastTimeout = setTimeout(() => {
    el.classList.remove('toast--visible');
  }, duration);
}

// ── Loading State ──────────────────────────────────────────

function setLoading(on) {
  const btn = document.getElementById('loadBtn');
  if (btn) {
    btn.disabled = on;
    btn.innerHTML = on
      ? '<svg class="btn__icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.22-8.56"/></svg>Loading…'
      : '<svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>Analyze';
  }
}

// ── Data Layer ─────────────────────────────────────────────

async function fetchLiveData(ticker, period) {
  const res = await fetch(`${API_BASE}/prices/${ticker}?period=${period}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 0xffffffff;
  };
}

function generateDemoData(ticker, period) {
  const meta = TICKER_META[ticker] ?? { label: ticker + '.JK', base: 5000, vol: 80 };
  const n = PERIOD_DAYS[period] + 60;
  const seed = [...ticker].reduce((acc, c) => acc + c.charCodeAt(0) * 31, 0);
  const rand = seededRng(seed);

  const prices = [meta.base];
  for (let i = 1; i < n; i++) {
    const drift = (rand() - 0.485) * meta.vol;
    prices.push(Math.max(prices[i - 1] + drift, meta.base * 0.45));
  }

  const trimmed = prices.slice(-PERIOD_DAYS[period] - 20);
  const now = new Date();
  const dates = trimmed.map((_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (trimmed.length - 1 - i));
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  });

  const last = trimmed[trimmed.length - 1];
  const prev = trimmed[trimmed.length - 2];
  return {
    ticker,
    yahoo_symbol: meta.label,
    prices: trimmed,
    dates,
    volume: trimmed.map(() => Math.floor(rand() * 1e9)),
    latest: last,
    change: last - prev,
    change_pct: ((last - prev) / prev) * 100,
    risk_level: 'Medium',
    ann_vol: 18.5,
    ml_prediction: rand() > 0.5 ? 'UP' : 'DOWN',
    ml_confidence: 50 + rand() * 40,
    isDemo: true,
  };
}

async function fetchOrDemo(ticker, period) {
  try {
    const data = await fetchLiveData(ticker, period);
    data.isDemo = false;
    return data;
  } catch {
    return generateDemoData(ticker, period);
  }
}

// ── Technical Indicators ───────────────────────────────────

function sma(arr, period) {
  return arr.map((_, i) => {
    if (i < period - 1) return null;
    const slice = arr.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function bollingerBands(prices, period = 20, k = 2) {
  const ma = sma(prices, period);
  return prices.map((_, i) => {
    if (ma[i] === null) return { upper: null, lower: null };
    const slice = prices.slice(i - period + 1, i + 1);
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - ma[i]) ** 2, 0) / period);
    return { upper: ma[i] + k * std, lower: ma[i] - k * std };
  });
}

function rsi(prices, period = 14) {
  if (prices.length <= period) return new Array(prices.length).fill(null);
  const result = new Array(period).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  result.push(100 - 100 / (1 + avgGain / (avgLoss || 1e-9)));
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    result.push(100 - 100 / (1 + avgGain / (avgLoss || 1e-9)));
  }
  return result;
}

function ema(arr, span) {
  const k = 2 / (span + 1);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
  return out;
}

function macd(prices) {
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

// ── Support & Resistance ───────────────────────────────────

function calculatePivotPoints(prices) {
  const n = Math.min(20, prices.length);
  const recent = prices.slice(-n);
  const high = Math.max(...recent);
  const low = Math.min(...recent);
  const close = recent[recent.length - 1];

  const pp = (high + low + close) / 3;
  return {
    r3: high + 2 * (pp - low),
    r2: pp + (high - low),
    r1: 2 * pp - low,
    pp: pp,
    s1: 2 * pp - high,
    s2: pp - (high - low),
    s3: low - 2 * (high - pp),
  };
}

function findSwingLevels(prices, windowSize = 5) {
  const swingHighs = [];
  const swingLows = [];

  for (let i = windowSize; i < prices.length - windowSize; i++) {
    const window = prices.slice(i - windowSize, i + windowSize + 1);
    if (prices[i] === Math.max(...window)) {
      swingHighs.push({ index: i, price: prices[i] });
    }
    if (prices[i] === Math.min(...window)) {
      swingLows.push({ index: i, price: prices[i] });
    }
  }

  // Cluster nearby levels (within 1.5%) — keep the most recent
  function clusterLevels(levels) {
    if (levels.length === 0) return [];
    const sorted = [...levels].sort((a, b) => b.index - a.index);
    const clustered = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const tooClose = clustered.some(
        c => Math.abs(c.price - sorted[i].price) / c.price < 0.015
      );
      if (!tooClose) clustered.push(sorted[i]);
    }
    return clustered.slice(0, 3).sort((a, b) => a.price - b.price);
  }

  return {
    resistanceLevels: clusterLevels(swingHighs),
    supportLevels: clusterLevels(swingLows),
  };
}

function getSRLevels(prices) {
  const pivots = calculatePivotPoints(prices);
  const swings = findSwingLevels(prices);
  return { pivots, swings };
}

// ── Render: Price Header ───────────────────────────────────

function renderPriceHeader(data) {
  const latest    = Number(data.latest) || 0;
  const change    = Number(data.change) || 0;
  const changePct = Number(data.change_pct) || 0;
  const isUp = change >= 0;

  const tickerEl = document.getElementById('tickerLabel');
  const priceEl = document.getElementById('priceDisplay');
  const changeEl = document.getElementById('changeDisplay');
  const noteEl = document.getElementById('dataNote');
  const riskBadge = document.getElementById('riskBadge');

  if (tickerEl) tickerEl.textContent = data.yahoo_symbol ?? data.ticker ?? '—';
  if (priceEl) priceEl.textContent = latest.toLocaleString('id-ID', { maximumFractionDigits: 0 });

  if (riskBadge && data.risk_level) {
    riskBadge.style.display = 'inline-block';
    riskBadge.textContent = `Risk: ${data.risk_level}`;
    riskBadge.className = `risk-badge risk-badge--${data.risk_level}`;
  } else if (riskBadge) {
    riskBadge.style.display = 'none';
  }

  if (changeEl) {
    changeEl.textContent = `${isUp ? '+' : ''}${change.toFixed(0)} (${isUp ? '+' : ''}${changePct.toFixed(2)}%)`;
    changeEl.className = 'change ' + (isUp ? 'change--up' : 'change--down');
  }

  if (noteEl) {
    // Clear any previous ticking clock
    if (state.liveClockInterval) clearInterval(state.liveClockInterval);

    if (data.isDemo) {
      noteEl.innerHTML = '<span class="data-badge__dot"></span>Demo data';
      noteEl.className = 'data-badge';
    } else {
      const updateClock = () => {
        if (noteEl) noteEl.innerHTML = '<span class="data-badge__dot"></span>Live · ' + new Date().toLocaleTimeString();
      };
      updateClock(); // set immediately
      noteEl.className = 'data-badge data-badge--live';
      state.liveClockInterval = setInterval(updateClock, 1000);
    }
  }
}

// ── Render: ML Prediction ──────────────────────────────────
function renderMLPrediction(data) {
  const dirEl = document.getElementById('mlDirection');
  const fillEl = document.getElementById('mlConfidenceFill');
  const textEl = document.getElementById('mlConfidenceText');

  if (!dirEl || !fillEl || !textEl) return;

  const pred = data.ml_prediction || 'Unknown';
  const conf = data.ml_confidence || 0;

  if (pred === 'Unknown' || conf === 0) {
    dirEl.textContent = '—';
    dirEl.className = 'ml-direction';
    fillEl.style.width = '0%';
    textEl.textContent = 'Not enough data';
    return;
  }

  const isUp = pred === 'UP';
  const upIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;
  const downIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="7" x2="17" y2="17"></line><polyline points="17 7 17 17 7 17"></polyline></svg>`;
  
  dirEl.innerHTML = isUp ? `${upIcon} UP` : `${downIcon} DOWN`;
  dirEl.className = `ml-direction ${isUp ? 'up' : 'down'}`;
  
  fillEl.className = `ml-confidence-fill ${isUp ? 'up' : 'down'}`;
  // Small animation delay for the bar
  setTimeout(() => {
    fillEl.style.width = `${conf}%`;
  }, 100);
  
  textEl.textContent = `${conf.toFixed(1)}% Confidence`;
}

// ── Render: Metrics ────────────────────────────────────────

function renderMetrics(prices) {
  const ma20v = sma(prices, 20);
  const ma50v = sma(prices, 50);
  const rsiV  = rsi(prices);
  const curMA20 = ma20v[ma20v.length - 1] ?? 0;
  const curMA50 = ma50v[ma50v.length - 1] ?? 0;
  const curRSI  = rsiV[rsiV.length - 1] ?? 0;
  const last = prices[prices.length - 1];
  const high20 = Math.max(...prices.slice(-20));
  const low20  = Math.min(...prices.slice(-20));

  const fmt = v => v.toLocaleString('id-ID', { maximumFractionDigits: 0 });

  const items = [
    { label: '20D High', val: fmt(high20), sub: '', icon: '↑' },
    { label: '20D Low',  val: fmt(low20),  sub: '', icon: '↓' },
    { label: 'MA 20',    val: fmt(curMA20), sub: last > curMA20 ? '↑ Above price' : '↓ Below price', isUp: last > curMA20 },
    { label: 'MA 50',    val: fmt(curMA50), sub: last > curMA50 ? '↑ Above price' : '↓ Below price', isUp: last > curMA50 },
    { label: 'RSI 14',   val: curRSI.toFixed(1), sub: curRSI > 70 ? 'Overbought' : curRSI < 30 ? 'Oversold' : 'Neutral', rsi: curRSI },
  ];

  const container = document.getElementById('metricsRow');
  if (!container) return;
  container.innerHTML = items.map(m => `
    <div class="metric">
      <div class="metric__label">${m.label}</div>
      <div class="metric__val">${m.val}</div>
      ${m.sub ? `<div class="metric__sub" style="color: ${
        m.rsi !== undefined ? (m.rsi > 70 ? 'var(--color-red)' : m.rsi < 30 ? 'var(--color-green)' : 'var(--color-text-2)')
        : m.isUp !== undefined ? (m.isUp ? 'var(--color-green)' : 'var(--color-red)')
        : 'var(--color-text-2)'
      }">${m.sub}</div>` : ''}
    </div>
  `).join('');
}

// ── Render: Signals ────────────────────────────────────────

function renderSignals(prices) {
  const last = prices[prices.length - 1];
  const rsiV = rsi(prices);
  const curRSI = rsiV[rsiV.length - 1] ?? 50;

  const ma20v = sma(prices, 20);
  const ma50v = sma(prices, 50);
  const curMA20 = ma20v[ma20v.length - 1] ?? 0;
  const curMA50 = ma50v[ma50v.length - 1] ?? 0;
  const prevMA20 = ma20v[ma20v.length - 2] ?? 0;
  const prevMA50 = ma50v[ma50v.length - 2] ?? 0;

  const { macdLine, signalLine } = macd(prices);
  const curMACD = macdLine[macdLine.length - 1];
  const prevMACD = macdLine[macdLine.length - 2];
  const curSig = signalLine[signalLine.length - 1];
  const prevSig = signalLine[signalLine.length - 2];

  const bb = bollingerBands(prices);
  const lastBB = bb[bb.length - 1];

  const recent5 = prices.slice(-6);
  const upDays = recent5.filter((p, i) => i > 0 && p > recent5[i - 1]).length;

  const signals = [
    {
      name: 'RSI Momentum',
      val: curRSI.toFixed(1),
      action: curRSI > 70 ? 'sell' : curRSI < 30 ? 'buy' : 'neutral',
      desc: curRSI > 70 ? 'Overbought zone — potential reversal' : curRSI < 30 ? 'Oversold zone — potential bounce' : 'Neutral range (30–70)',
    },
    {
      name: 'MA Crossover',
      val: `${curMA20.toFixed(0)} / ${curMA50.toFixed(0)}`,
      action: prevMA20 < prevMA50 && curMA20 > curMA50 ? 'buy'
            : prevMA20 > prevMA50 && curMA20 < curMA50 ? 'sell'
            : curMA20 > curMA50 ? 'buy' : 'sell',
      desc: curMA20 > curMA50 ? 'Golden cross: MA20 above MA50' : 'Death cross: MA20 below MA50',
    },
    {
      name: 'MACD Signal',
      val: curMACD.toFixed(2),
      action: prevMACD < prevSig && curMACD > curSig ? 'buy'
            : prevMACD > prevSig && curMACD < curSig ? 'sell'
            : curMACD > curSig ? 'buy' : 'neutral',
      desc: curMACD > curSig ? 'Bullish — MACD above signal' : 'Bearish — MACD below signal',
    },
    {
      name: 'Bollinger Band',
      val: last.toFixed(0),
      action: lastBB.lower && last < lastBB.lower ? 'buy'
            : lastBB.upper && last > lastBB.upper ? 'sell'
            : 'neutral',
      desc: lastBB.lower && last < lastBB.lower ? 'Below lower band — oversold'
          : lastBB.upper && last > lastBB.upper ? 'Above upper band — overbought'
          : 'Price within normal range',
    },
    {
      name: 'Price vs MA50',
      val: ((last / curMA50 - 1) * 100).toFixed(2) + '%',
      action: last > curMA50 * 1.02 ? 'buy' : last < curMA50 * 0.98 ? 'sell' : 'neutral',
      desc: last > curMA50 ? 'Trading above long-term average' : 'Trading below long-term average',
    },
    {
      name: '5-Day Trend',
      val: `${upDays}/5 up days`,
      action: upDays >= 3 ? 'buy' : upDays <= 1 ? 'sell' : 'neutral',
      desc: upDays >= 3 ? 'Short-term momentum is bullish' : upDays <= 1 ? 'Short-term momentum is bearish' : 'Sideways consolidation',
    },
  ];

  const container = document.getElementById('signalGrid');
  if (!container) return;
  container.innerHTML = signals.map(s => `
    <div class="signal-card">
      <div class="signal-card__name">${s.name}</div>
      <div class="signal-card__val signal-card__val--${s.action}">${s.val}</div>
      <span class="badge badge--${s.action}">${s.action.toUpperCase()}</span>
      <div class="signal-card__desc">${s.desc}</div>
    </div>
  `).join('');
}

// ── Render: Support & Resistance Card ──────────────────────

function renderSRCard(prices) {
  const srCard = document.getElementById('srCard');
  const srLevels = document.getElementById('srLevels');
  if (!srCard || !srLevels) return;

  if (!state.indicators.sr) {
    srCard.style.display = 'none';
    return;
  }

  srCard.style.display = 'block';
  const { pivots, swings } = getSRLevels(prices);
  const currentPrice = prices[prices.length - 1];
  const fmt = v => v.toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const pctDiff = (v) => {
    const diff = ((v - currentPrice) / currentPrice * 100);
    const sign = diff >= 0 ? '+' : '';
    const cls = diff >= 0 ? 'up' : 'down';
    return `<span class="sr-level__diff sr-level__diff--${cls}">${sign}${diff.toFixed(2)}%</span>`;
  };

  const levels = [
    { label: 'Resistance 3', value: pivots.r3, type: 'resistance' },
    { label: 'Resistance 2', value: pivots.r2, type: 'resistance' },
    { label: 'Resistance 1', value: pivots.r1, type: 'resistance' },
    { label: 'Pivot Point',  value: pivots.pp, type: 'pivot' },
    { label: 'Support 1',    value: pivots.s1, type: 'support' },
    { label: 'Support 2',    value: pivots.s2, type: 'support' },
    { label: 'Support 3',    value: pivots.s3, type: 'support' },
  ];

  // Add swing-based levels
  swings.resistanceLevels.forEach((s, i) => {
    levels.push({ label: `Swing High ${i + 1}`, value: s.price, type: 'resistance' });
  });
  swings.supportLevels.forEach((s, i) => {
    levels.push({ label: `Swing Low ${i + 1}`, value: s.price, type: 'support' });
  });

  // Sort by value descending
  levels.sort((a, b) => b.value - a.value);

  srLevels.innerHTML = levels.map(l => `
    <div class="sr-level sr-level--${l.type}">
      <span class="sr-level__label">${l.label}</span>
      <div>
        <span class="sr-level__value">${fmt(l.value)}</span>
        ${pctDiff(l.value)}
      </div>
    </div>
  `).join('');
}

// ── Charts ─────────────────────────────────────────────────

function getChartColors() {
  const isDark = state.theme === 'dark';
  return {
    grid: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
    tick: isDark ? '#55544e' : '#9b9ba2',
    price: isDark ? '#3b82f6' : '#2563eb',
    priceFill: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(37,99,235,0.06)',
    ma20: '#60a5fa',
    ma50: '#f59e0b',
    bbBorder: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
    bbFill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    rsi: '#a78bfa',
    macdLine: '#34d399',
    macdSignal: '#f59e0b',
    histUp: isDark ? 'rgba(52,211,153,0.5)' : 'rgba(5,150,105,0.5)',
    histDown: isDark ? 'rgba(248,113,113,0.5)' : 'rgba(220,38,38,0.5)',
    tooltipBg: isDark ? 'rgba(16,16,24,0.95)' : 'rgba(255,255,255,0.95)',
    tooltipText: isDark ? '#eae9e4' : '#1a1a20',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
  };
}

function getBaseChartOptions() {
  const c = getChartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600, easing: 'easeOutQuart' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.tooltipBg,
        titleColor: c.tooltipText,
        bodyColor: c.tooltipText,
        borderColor: c.tooltipBorder,
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        titleFont: { family: "'Inter', sans-serif", size: 12, weight: '600' },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
        displayColors: true,
        boxPadding: 4,
      },
    },
    scales: {
      x: {
        ticks: { color: c.tick, font: { size: 11, family: "'Inter', sans-serif" }, maxTicksLimit: 8 },
        grid: { color: c.grid },
        border: { display: false },
      },
      y: {
        ticks: { color: c.tick, font: { size: 11, family: "'Inter', sans-serif" } },
        grid: { color: c.grid },
        border: { display: false },
      },
    },
  };
}

function buildCharts(prices, labels) {
  const c = getChartColors();
  const ma20v = sma(prices, 20);
  const ma50v = sma(prices, 50);
  const bb = bollingerBands(prices);
  const rsiV = rsi(prices);
  const { macdLine, signalLine, histogram } = macd(prices);

  // Destroy existing charts
  Object.values(state.charts).forEach(chart => { if (chart) chart.destroy(); });
  state.charts = { price: null, rsi: null, macd: null, compare: state.charts.compare };

  const baseOpts = getBaseChartOptions();

  // ── Price Chart with S/R annotations ──────────────
  const priceSets = [{
    label: 'Price',
    data: prices,
    borderColor: c.price,
    backgroundColor: c.priceFill,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHoverBackgroundColor: c.price,
    fill: true,
    tension: 0.35,
    order: 3,
  }];

  if (state.indicators.ma20) priceSets.push({
    label: 'MA 20', data: ma20v, borderColor: c.ma20,
    borderWidth: 1.5, borderDash: [5, 3], pointRadius: 0, fill: false, tension: 0.35, order: 2,
  });
  if (state.indicators.ma50) priceSets.push({
    label: 'MA 50', data: ma50v, borderColor: c.ma50,
    borderWidth: 1.5, borderDash: [7, 3], pointRadius: 0, fill: false, tension: 0.35, order: 2,
  });
  if (state.indicators.bb) {
    priceSets.push({
      label: 'BB Upper', data: bb.map(b => b.upper), borderColor: c.bbBorder,
      borderWidth: 0.8, borderDash: [2, 3], pointRadius: 0,
      fill: '+1', backgroundColor: c.bbFill, tension: 0.35, order: 1,
    });
    priceSets.push({
      label: 'BB Lower', data: bb.map(b => b.lower), borderColor: c.bbBorder,
      borderWidth: 0.8, borderDash: [2, 3], pointRadius: 0, fill: false, tension: 0.35, order: 1,
    });
  }

  // S/R Annotations
  let annotations = {};
  if (state.indicators.sr) {
    const { pivots } = getSRLevels(prices);
    const srLevels = [
      { key: 'r3', val: pivots.r3, label: 'R3', color: 'rgba(248,113,113,0.7)' },
      { key: 'r2', val: pivots.r2, label: 'R2', color: 'rgba(248,113,113,0.55)' },
      { key: 'r1', val: pivots.r1, label: 'R1', color: 'rgba(248,113,113,0.4)' },
      { key: 'pp', val: pivots.pp, label: 'PP', color: 'rgba(129,140,248,0.6)' },
      { key: 's1', val: pivots.s1, label: 'S1', color: 'rgba(52,211,153,0.4)' },
      { key: 's2', val: pivots.s2, label: 'S2', color: 'rgba(52,211,153,0.55)' },
      { key: 's3', val: pivots.s3, label: 'S3', color: 'rgba(52,211,153,0.7)' },
    ];

    srLevels.forEach(sr => {
      annotations[sr.key] = {
        type: 'line',
        yMin: sr.val,
        yMax: sr.val,
        borderColor: sr.color,
        borderWidth: 1.5,
        borderDash: [6, 4],
        label: {
          display: true,
          content: `${sr.label}: ${sr.val.toFixed(0)}`,
          position: 'end',
          backgroundColor: sr.color,
          color: '#fff',
          font: { size: 10, weight: '600', family: "'Inter', sans-serif" },
          padding: { top: 2, bottom: 2, left: 6, right: 6 },
          borderRadius: 4,
        },
      };
    });
  }

  const priceCtx = document.getElementById('priceChart');
  if (priceCtx) {
    state.charts.price = new Chart(priceCtx, {
      type: 'line',
      data: { labels, datasets: priceSets },
      options: {
        ...baseOpts,
        plugins: {
          ...baseOpts.plugins,
          annotation: { annotations },
        },
      },
    });
  }

  // ── RSI Chart ─────────────────────────────────────
  const rsiCtx = document.getElementById('rsiChart');
  if (rsiCtx) {
    const rsiAnnotations = {
      overbought: {
        type: 'line', yMin: 70, yMax: 70,
        borderColor: 'rgba(248,113,113,0.3)', borderWidth: 1, borderDash: [4, 4],
      },
      oversold: {
        type: 'line', yMin: 30, yMax: 30,
        borderColor: 'rgba(52,211,153,0.3)', borderWidth: 1, borderDash: [4, 4],
      },
    };

    state.charts.rsi = new Chart(rsiCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'RSI', data: rsiV, borderColor: c.rsi,
          borderWidth: 1.8, pointRadius: 0, pointHoverRadius: 3,
          fill: false, tension: 0.35,
        }],
      },
      options: {
        ...baseOpts,
        scales: {
          x: { ...baseOpts.scales.x, ticks: { ...baseOpts.scales.x.ticks, maxTicksLimit: 6 } },
          y: { ...baseOpts.scales.y, min: 0, max: 100 },
        },
        plugins: {
          ...baseOpts.plugins,
          annotation: { annotations: rsiAnnotations },
        },
      },
    });
  }

  // ── MACD Chart ────────────────────────────────────
  const macdCtx = document.getElementById('macdChart');
  if (macdCtx) {
    state.charts.macd = new Chart(macdCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'line', label: 'MACD', data: macdLine, borderColor: c.macdLine,
            borderWidth: 1.8, pointRadius: 0, fill: false, tension: 0.35, order: 1,
          },
          {
            type: 'line', label: 'Signal', data: signalLine, borderColor: c.macdSignal,
            borderWidth: 1.2, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.35, order: 1,
          },
          {
            label: 'Histogram', data: histogram,
            backgroundColor: histogram.map(v => v >= 0 ? c.histUp : c.histDown),
            borderWidth: 0, borderRadius: 2, order: 2,
          },
        ],
      },
      options: {
        ...baseOpts,
        scales: {
          x: { ...baseOpts.scales.x, ticks: { ...baseOpts.scales.x.ticks, maxTicksLimit: 6 } },
          y: baseOpts.scales.y,
        },
      },
    });
  }
}

// ── Multi-Stock Comparison ─────────────────────────────────

function renderCompareChips() {
  const container = document.getElementById('compareChips');
  if (!container) return;

  container.innerHTML = AVAILABLE_TICKERS.map(t => {
    const isActive = state.compareTickers.includes(t);
    const colorIdx = state.compareTickers.indexOf(t);
    const color = colorIdx >= 0 ? COMPARE_COLORS[colorIdx % COMPARE_COLORS.length] : '';
    return `<button class="compare-chip ${isActive ? 'compare-chip--active' : ''}" 
            data-ticker="${t}"
            ${isActive ? `style="border-color:${color}; color:${color}; background:${color}15;"` : ''}>
              ${t}
            </button>`;
  }).join('');

  // Re-attach event listeners
  container.querySelectorAll('.compare-chip').forEach(chip => {
    chip.addEventListener('click', () => toggleCompareTicker(chip.dataset.ticker));
  });
}

function toggleCompareTicker(ticker) {
  const idx = state.compareTickers.indexOf(ticker);
  if (idx >= 0) {
    state.compareTickers.splice(idx, 1);
  } else {
    if (state.compareTickers.length >= 8) {
      showToast('Maximum 8 stocks for comparison', 'warn');
      return;
    }
    state.compareTickers.push(ticker);
  }
  renderCompareChips();
  updateComparison();
}

function addCustomCompare() {
  const input = document.getElementById('compareCustom');
  if (!input) return;
  const ticker = input.value.trim().toUpperCase();
  if (!ticker) return;
  if (state.compareTickers.includes(ticker)) {
    showToast(`${ticker} is already in comparison`, 'warn');
    return;
  }
  if (state.compareTickers.length >= 8) {
    showToast('Maximum 8 stocks for comparison', 'warn');
    return;
  }
  state.compareTickers.push(ticker);
  input.value = '';
  renderCompareChips();
  updateComparison();
}

async function updateComparison() {
  const tickers = state.compareTickers;
  const emptyEl = document.getElementById('compareEmpty');
  const contentEl = document.getElementById('compareContent');

  if (tickers.length < 2) {
    if (emptyEl) emptyEl.style.display = 'flex';
    if (contentEl) contentEl.style.display = 'none';
    if (state.charts.compare) { state.charts.compare.destroy(); state.charts.compare = null; }
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';

  // Fetch data for all tickers
  const allData = {};
  for (const t of tickers) {
    const cacheKey = `${t}_${state.period}`;
    if (state.compareDataCache[cacheKey]) {
      allData[t] = state.compareDataCache[cacheKey];
    } else {
      allData[t] = await fetchOrDemo(t, state.period);
      state.compareDataCache[cacheKey] = allData[t];
    }
  }

  buildCompareChart(allData, tickers);
  renderCompareTable(allData, tickers);
}

function buildCompareChart(allData, tickers) {
  if (state.charts.compare) state.charts.compare.destroy();

  const c = getChartColors();
  const baseOpts = getBaseChartOptions();

  // Use the longest date array
  let maxLen = 0;
  let bestLabels = [];
  for (const t of tickers) {
    const prices = allData[t].prices.filter(Boolean);
    if (prices.length > maxLen) {
      maxLen = prices.length;
      bestLabels = allData[t].dates.slice(-prices.length);
    }
  }

  // Normalize all to percentage change from start
  const datasets = tickers.map((t, idx) => {
    const prices = allData[t].prices.filter(Boolean);
    const base = prices[0];
    const normalized = prices.map(p => ((p - base) / base) * 100);
    // Pad shorter arrays with null at the beginning
    const padded = new Array(maxLen - normalized.length).fill(null).concat(normalized);
    const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];

    return {
      label: t,
      data: padded,
      borderColor: color,
      backgroundColor: color + '10',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: color,
      fill: false,
      tension: 0.35,
    };
  });

  // Add zero line annotation
  const annotations = {
    zeroLine: {
      type: 'line', yMin: 0, yMax: 0,
      borderColor: c.tick, borderWidth: 1, borderDash: [4, 4],
    },
  };

  const compareCtx = document.getElementById('compareChart');
  if (!compareCtx) return;

  state.charts.compare = new Chart(compareCtx, {
    type: 'line',
    data: { labels: bestLabels, datasets },
    options: {
      ...baseOpts,
      plugins: {
        ...baseOpts.plugins,
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: c.tick,
            font: { family: "'Inter', sans-serif", size: 12, weight: '600' },
            boxWidth: 12,
            boxHeight: 3,
            borderRadius: 2,
            useBorderRadius: true,
            padding: 16,
          },
        },
        annotation: { annotations },
        tooltip: {
          ...baseOpts.plugins.tooltip,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)}%`,
          },
        },
      },
      scales: {
        ...baseOpts.scales,
        y: {
          ...baseOpts.scales.y,
          ticks: {
            ...baseOpts.scales.y.ticks,
            callback: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
          },
        },
      },
    },
  });
}

function renderCompareTable(allData, tickers) {
  const container = document.getElementById('compareTable');
  if (!container) return;

  const rows = tickers.map((t, idx) => {
    const prices = allData[t].prices.filter(Boolean);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const returnPct = ((last - first) / first * 100);
    const rsiV = rsi(prices);
    const curRSI = rsiV[rsiV.length - 1] ?? 0;

    // Simple volatility: standard deviation of daily returns
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1] * 100);
    }
    const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
    const volatility = Math.sqrt(returns.reduce((a, b) => a + (b - meanRet) ** 2, 0) / returns.length);

    const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
    const isUp = returnPct >= 0;

    return `<tr>
      <td><div class="ticker-cell"><span class="dot" style="background:${color}"></span>${t}</div></td>
      <td class="val-mono">${last.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
      <td class="${isUp ? 'val-up' : 'val-down'}">${isUp ? '+' : ''}${returnPct.toFixed(2)}%</td>
      <td class="val-mono">${volatility.toFixed(2)}%</td>
      <td class="val-mono" style="color: ${curRSI > 70 ? 'var(--color-red)' : curRSI < 30 ? 'var(--color-green)' : 'var(--color-text-2)'}">${curRSI.toFixed(1)}</td>
    </tr>`;
  });

  container.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Price</th>
          <th>Return</th>
          <th>Volatility</th>
          <th>RSI</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  `;
}

// ── Main Load ──────────────────────────────────────────────

async function loadStock(isAuto = false) {
  const page = document.body.dataset.page || 'search';

  if (!isAuto) {
    if (page === 'market') {
      state.ticker = 'IHSG';
    } else {
      const customInput = document.getElementById('customTicker');
      const selectInput = document.getElementById('stockSelect');
      const custom = customInput ? customInput.value.trim().toUpperCase() : '';
      const select = selectInput ? selectInput.value : '';
      state.ticker = custom || select;
    }

    if (!state.ticker) {
      // Empty state: show skeletons, do not fetch
      return;
    }

    setLoading(true);
    if (state.pollingInterval) clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }

  let data;
  try {
    data = await fetchLiveData(state.ticker, state.period);
    data.isDemo = false;
    state.usingLiveData = true;
    showToast(`Live data loaded for ${state.ticker}`, 'success');
  } catch (err) {
    data = generateDemoData(state.ticker, state.period);
    state.usingLiveData = false;
    showToast('Server offline — showing demo data', 'warn', 5000);
  }

  const prices = data.prices.filter(Boolean);
  const labels = data.dates.slice(-prices.length);

  state.lastPrices = prices;
  state.lastLabels = labels;

  renderPriceHeader(data);
  renderMLPrediction(data);
  renderMetrics(prices);
  renderSignals(prices);
  renderSRCard(prices);
  buildCharts(prices, labels);

  // Load AI Analyst Verdict (async, doesn't block UI)
  if (!isAuto && document.getElementById('analystCard')) {
    loadAnalysis();
  }

  if (!isAuto) setLoading(false);

  // Auto-poll every 15 seconds if we are on live data
  if (state.usingLiveData && !state.pollingInterval) {
    state.pollingInterval = setInterval(() => loadStock(true), 15000);
  }
}

// ── Event Listeners ────────────────────────────────────────

// Theme toggle
document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

// Analyze button
document.getElementById('loadBtn')?.addEventListener('click', loadStock);

// Stock selector change
document.getElementById('stockSelect')?.addEventListener('change', () => {
  const customInput = document.getElementById('customTicker');
  if (customInput) customInput.value = '';
  loadStock();
});

// Custom ticker enter
document.getElementById('customTicker')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadStock();
});

// Period buttons
document.querySelectorAll('.ctrl-btn[data-period]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ctrl-btn[data-period]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.period = btn.dataset.period;
    // Clear comparison cache when period changes
    state.compareDataCache = {};
    loadStock();
    if (state.compareTickers.length >= 2) updateComparison();
  });
});

// Indicator chips
document.querySelectorAll('.chip[data-ind]').forEach(chip => {
  chip.addEventListener('click', () => {
    const ind = chip.dataset.ind;
    state.indicators[ind] = !state.indicators[ind];
    chip.classList.toggle('chip--on', state.indicators[ind]);

    // Re-render S/R card when toggled
    if (ind === 'sr') {
      renderSRCard(state.lastPrices);
    }

    // Rebuild charts with new indicator state
    if (state.lastPrices.length > 0) {
      buildCharts(state.lastPrices, state.lastLabels);
    }
  });
});

// Comparison: add custom ticker
document.getElementById('addCompareBtn')?.addEventListener('click', addCustomCompare);
document.getElementById('compareCustom')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') addCustomCompare();
});

// ── AI Analyst Verdict ─────────────────────────────────────

async function loadAnalysis() {
  try {
    const resp = await fetch(`${API_BASE}/analysis/${state.ticker}?period=${state.period}`);
    if (!resp.ok) throw new Error('Analysis API failed');
    const data = await resp.json();
    renderAnalystVerdict(data);
  } catch (err) {
    console.warn('Analysis load failed:', err);
    // Show fallback
    const summaryEl = document.getElementById('verdictSummary');
    if (summaryEl) {
      summaryEl.innerHTML = `<p class="verdict-summary__text" style="color:var(--color-red)">Error: ${err.message}. Please ensure the Python server is running and updated.</p>`;
    }
  }
}

function renderAnalystVerdict(data) {
  const gaugeArc = document.getElementById('gaugeArc');
  const gaugeLabel = document.getElementById('gaugeLabel');
  const gaugeSublabel = document.getElementById('gaugeSublabel');
  const summaryEl = document.getElementById('verdictSummary');
  const stratEntry = document.getElementById('stratEntry');
  const stratTarget = document.getElementById('stratTarget');
  const stratStop = document.getElementById('stratStop');
  const stratRR = document.getElementById('stratRR');

  if (!gaugeArc || !gaugeLabel) return;

  // Animate gauge arc: total arc length is ~251
  const arcLength = 251;
  const fillPct = data.verdict_score / 100;
  const offset = arcLength * (1 - fillPct);

  setTimeout(() => {
    gaugeArc.style.transition = 'stroke-dashoffset 1.5s ease-out';
    gaugeArc.setAttribute('stroke-dashoffset', offset);
  }, 100);

  gaugeLabel.textContent = data.verdict;
  gaugeSublabel.textContent = `Score: ${data.verdict_score}/100`;

  // Color the label based on verdict
  const verdictColors = {
    'Strong Buy': '#16a34a',
    'Buy': '#22c55e',
    'Hold': '#eab308',
    'Sell': '#f59e0b',
    'Strong Sell': '#ef4444',
  };
  gaugeLabel.setAttribute('fill', verdictColors[data.verdict] || 'var(--color-text-1)');

  // Summary
  if (summaryEl) {
    summaryEl.innerHTML = `<p class="verdict-summary__text">${data.summary}</p>`;
  }

  // Strategy cards
  const fmt = v => Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  if (stratEntry) stratEntry.textContent = `${fmt(data.entry_zone.low)} – ${fmt(data.entry_zone.high)}`;
  if (stratTarget) stratTarget.textContent = fmt(data.target_price);
  if (stratStop) stratStop.textContent = fmt(data.stop_loss);
  if (stratRR) stratRR.textContent = `${data.risk_reward_ratio}x`;

  // Scorecard stars
  const renderStars = (score) => {
    const full = Math.floor(score);
    const half = score % 1 >= 0.4 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '⯪' : '') + '☆'.repeat(empty);
  };

  const scMap = {
    scTrend: data.scorecard.trend,
    scMomentum: data.scorecard.momentum,
    scVolatility: data.scorecard.volatility,
    scValue: data.scorecard.value,
    scML: data.scorecard.ml_signal,
  };

  for (const [id, score] of Object.entries(scMap)) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = renderStars(score);
      el.style.color = score >= 4 ? 'var(--color-green)' : score >= 3 ? 'var(--color-amber)' : 'var(--color-red)';
    }
  }
}

// ── News Sentiment ─────────────────────────────────────────

async function loadNews() {
  try {
    const resp = await fetch(`${API_BASE}/news`);
    if (!resp.ok) throw new Error('News API failed');
    const data = await resp.json();
    renderNewsFeed(data);
  } catch (err) {
    console.warn('News load failed:', err);
    const feed = document.getElementById('newsFeed');
    if (feed) {
      feed.innerHTML = `<div class="news-placeholder" style="color:var(--color-red)">Error: ${err.message}. Please ensure the Python server is running.</div>`;
    }
  }
}

function renderNewsFeed(data) {
  const moodFill = document.getElementById('moodFill');
  const moodIndicator = document.getElementById('moodIndicator');
  const moodText = document.getElementById('moodScoreText');
  const feedEl = document.getElementById('newsFeed');

  // Update mood meter
  if (moodFill && moodIndicator && moodText) {
    setTimeout(() => {
      moodFill.style.width = '100%'; // always show full gradient
      moodIndicator.style.left = `${data.mood_score}%`;
    }, 200);
    moodText.textContent = `Market Mood: ${data.mood_label} (${data.mood_score}/100)`;
  }

  // Render headlines
  if (feedEl && data.headlines && data.headlines.length > 0) {
    feedEl.innerHTML = data.headlines.map(item => {
      const sentimentIcon = item.sentiment === 'Bullish' ? '📈' : item.sentiment === 'Bearish' ? '📉' : '➖';
      // Parse and format date
      let timeStr = '';
      if (item.pubDate) {
        try {
          const d = new Date(item.pubDate);
          timeStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        } catch { timeStr = item.pubDate; }
      }
      return `
        <a class="news-item" href="${item.link}" target="_blank" rel="noopener noreferrer">
          <div class="news-item__content">
            <div class="news-item__title">${item.title}</div>
            <div class="news-item__meta">${item.source}${timeStr ? ' · ' + timeStr : ''}</div>
          </div>
          <span class="news-pill news-pill--${item.sentiment}">${sentimentIcon} ${item.sentiment}</span>
        </a>
      `;
    }).join('');
  } else if (feedEl) {
    feedEl.innerHTML = '<div class="news-placeholder">No news headlines available at this time.</div>';
  }
}

// ── Smooth scroll for nav links ────────────────────────────
document.querySelectorAll('.header-nav__link').forEach(link => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');
    if (href && href.startsWith('#')) {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      document.querySelectorAll('.header-nav__link').forEach(l => l.classList.remove('header-nav__link--active'));
      link.classList.add('header-nav__link--active');
    }
  });
});

// ── Initialize ─────────────────────────────────────────────

applyTheme(state.theme);
renderCompareChips();
loadStock();
loadNews();

// Auto-refresh news every 5 minutes
setInterval(loadNews, 300000);
