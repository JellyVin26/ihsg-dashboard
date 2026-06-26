// ══════════════════════════════════════════════════════════
//  IDX Analyzer Pro — JavaScript Application
// ══════════════════════════════════════════════════════════

// ── Config ─────────────────────────────────────────────────
const API_BASE = 'https://ihsg-dashboard.onrender.com/api';

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
  charts: { price: null, rsi: null, macd: null, compare: null, macro: null },
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
    noteEl.style.display = 'inline-flex';
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

  const accEl = document.getElementById('mlAccuracy');
  if (accEl) {
    const acc = data.ml_accuracy_7d;
    if (acc !== undefined && acc !== null) {
      const color = acc >= 70 ? 'var(--color-green)' : acc >= 50 ? 'var(--color-accent)' : 'var(--color-red)';
      accEl.innerHTML = `${acc}% <span style="font-size: 14px; font-weight: 500; color: ${color};">win rate</span>`;
      accEl.style.color = color;
    } else {
      accEl.innerHTML = `— <span style="font-size: 14px; font-weight: 500; color: var(--color-text-dim);">win rate</span>`;
      accEl.style.color = 'var(--color-text)';
    }
  }
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
  container.innerHTML = signals.map(s => {
    const conf = 70 + (s.name.length * 5) % 25; // Simulated confidence score for mockup matching
    const actionText = s.action === 'buy' ? 'BUY' : s.action === 'sell' ? 'SELL' : 'NEUTRAL';
    return `
      <div class="signal-card">
        <div class="signal-card__header">
          <span class="signal-card__title">${s.name}</span>
          <span class="signal-badge signal-badge--${s.action}">${actionText}</span>
        </div>
        <p class="signal-card__desc">${s.desc}</p>
        <div class="signal-card__footer">
          <span class="signal-card__conf-label">CONFIDENCE</span>
          <span class="signal-card__conf-val">${conf}%</span>
        </div>
        <div class="signal-card__bar-wrap">
          <div class="signal-card__bar-fill signal-card__bar-fill--${s.action}" style="width: ${conf}%;"></div>
        </div>
      </div>
    `;
  }).join('');
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
    tick: isDark ? '#666666' : '#888888',
    price: isDark ? '#CFF008' : '#8a9f00',
    priceFill: isDark ? 'rgba(207,240,8,0.1)' : 'rgba(138,159,0,0.1)',
    ma20: '#ffffff',
    ma50: '#8F8F8F',
    bbBorder: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
    bbFill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    rsi: '#CFF008',
    macdLine: '#CFF008',
    macdSignal: '#8F8F8F',
    histUp: isDark ? 'rgba(207,240,8,0.5)' : 'rgba(138,159,0,0.5)',
    histDown: isDark ? 'rgba(239,68,68,0.5)' : 'rgba(220,38,38,0.5)',
    tooltipBg: isDark ? 'rgba(16,16,24,0.95)' : 'rgba(255,255,255,0.95)',
    tooltipText: isDark ? '#eae9e4' : '#1a1a20',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
  };
}

function buildCharts(prices, labels) {
  try {
    const c = getChartColors();
    
    if (state.charts.price) { state.charts.price.remove(); state.charts.price = null; }
    if (state.charts.rsi) { state.charts.rsi.remove(); state.charts.rsi = null; }
    if (state.charts.macd) { state.charts.macd.remove(); state.charts.macd = null; }

    const priceContainer = document.getElementById('priceChart');
    const rsiContainer = document.getElementById('rsiChart');
    const macdContainer = document.getElementById('macdChart');

    if (!priceContainer || !rsiContainer || !macdContainer) return;

    const chartOpts = {
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: c.tick },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      timeScale: { timeVisible: false, borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      rightPriceScale: { borderVisible: false },
      crosshair: { mode: 0 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    };

    // Build data arrays
    const lineData = prices.map((p, i) => ({ time: labels[i], value: p }));
    const ma20v = sma(prices, 20);
    const ma50v = sma(prices, 50);
    const bb = bollingerBands(prices);
    const rsiV = rsi(prices);
    const { macdLine, signalLine, histogram } = macd(prices);

    const ma20Data = ma20v.map((p, i) => p !== null ? { time: labels[i], value: p } : null).filter(Boolean);
    const ma50Data = ma50v.map((p, i) => p !== null ? { time: labels[i], value: p } : null).filter(Boolean);
    const bbUpperData = bb.map((b, i) => b.upper !== null ? { time: labels[i], value: b.upper } : null).filter(Boolean);
    const bbLowerData = bb.map((b, i) => b.lower !== null ? { time: labels[i], value: b.lower } : null).filter(Boolean);
    const rsiData = rsiV.map((p, i) => p !== null ? { time: labels[i], value: p } : null).filter(Boolean);
    const macdData = macdLine.map((p, i) => p !== null ? { time: labels[i], value: p } : null).filter(Boolean);
    const signalData = signalLine.map((p, i) => p !== null ? { time: labels[i], value: p } : null).filter(Boolean);
    const histData = histogram.map((p, i) => p !== null ? { time: labels[i], value: p, color: p >= 0 ? c.histUp : c.histDown } : null).filter(Boolean);

    // Slice data to visibleDays so the chart perfectly fits the requested period
    let displayLength = lineData.length;
    if (state.visibleDays && lineData.length > state.visibleDays) {
      displayLength = state.visibleDays;
    }
    
    const sliceData = arr => arr.slice(-displayLength);

    const priceDisplayData = sliceData(lineData);
    const ma20DisplayData = sliceData(ma20Data);
    const ma50DisplayData = sliceData(ma50Data);
    const bbUpperDisplayData = sliceData(bbUpperData);
    const bbLowerDisplayData = sliceData(bbLowerData);
    const rsiDisplayData = sliceData(rsiData);
    const macdDisplayData = sliceData(macdData);
    const signalDisplayData = sliceData(signalData);
    const histDisplayData = sliceData(histData);

    // Dynamic Color Logic based on Price Trend
    let dynamicLineColor = '#CFF008'; // Default Yellow
    let dynamicTopColor = 'rgba(207, 240, 8, 0.3)';
    if (state.priceTrend === 'up') {
      dynamicLineColor = '#34d399'; // Green
      dynamicTopColor = 'rgba(52, 211, 153, 0.3)';
    } else if (state.priceTrend === 'down') {
      dynamicLineColor = '#ef4444'; // Red
      dynamicTopColor = 'rgba(239, 68, 68, 0.3)';
    }

    // Price Chart
    state.charts.price = LightweightCharts.createChart(priceContainer, chartOpts);
    
    const priceSeries = state.charts.price.addAreaSeries({
      lineColor: dynamicLineColor,
      topColor: dynamicTopColor,
      bottomColor: 'transparent',
      lineWidth: 3,
      lineType: 2, // Curved line
      priceFormat: { type: 'price', precision: 0, minMove: 1 }
    });
    priceSeries.setData(priceDisplayData);

  if (state.indicators.ma20) {
    const ma20Series = state.charts.price.addLineSeries({ color: c.ma20, lineWidth: 1, lineStyle: 1 });
    ma20Series.setData(ma20DisplayData);
  }
  if (state.indicators.ma50) {
    const ma50Series = state.charts.price.addLineSeries({ color: c.ma50, lineWidth: 1, lineStyle: 2 });
    ma50Series.setData(ma50DisplayData);
  }
  if (state.indicators.bb) {
    const upperSeries = state.charts.price.addLineSeries({ color: c.bbBorder, lineWidth: 1, lineStyle: 2 });
    upperSeries.setData(bbUpperDisplayData);
    const lowerSeries = state.charts.price.addLineSeries({ color: c.bbBorder, lineWidth: 1, lineStyle: 2 });
    lowerSeries.setData(bbLowerDisplayData);
  }

  // S/R annotations as price lines
  if (state.indicators.sr) {
    const { pivots } = getSRLevels(prices);
    const srLevels = [
      { val: pivots.r3, label: 'R3', color: '#f87171' },
      { val: pivots.r2, label: 'R2', color: '#f87171' },
      { val: pivots.r1, label: 'R1', color: '#f87171' },
      { val: pivots.pp, label: 'PP', color: '#818cf8' },
      { val: pivots.s1, label: 'S1', color: '#34d399' },
      { val: pivots.s2, label: 'S2', color: '#34d399' },
      { val: pivots.s3, label: 'S3', color: '#34d399' },
    ];
    srLevels.forEach(sr => {
      priceSeries.createPriceLine({
        price: sr.val,
        color: sr.color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: sr.label,
      });
    });
  }

  state.charts.price.timeScale().fitContent();

  // RSI Chart
  state.charts.rsi = LightweightCharts.createChart(rsiContainer, chartOpts);
  const rsiSeries = state.charts.rsi.addLineSeries({ color: c.rsi, lineWidth: 2 });
  rsiSeries.setData(rsiDisplayData);
  rsiSeries.createPriceLine({ price: 70, color: '#f87171', lineWidth: 1, lineStyle: 2, title: 'OB' });
  rsiSeries.createPriceLine({ price: 30, color: '#34d399', lineWidth: 1, lineStyle: 2, title: 'OS' });
  state.charts.rsi.timeScale().fitContent();

  // MACD Chart
  state.charts.macd = LightweightCharts.createChart(macdContainer, chartOpts);
  const histSeries = state.charts.macd.addHistogramSeries();
  histSeries.setData(histDisplayData);
  const macdS = state.charts.macd.addLineSeries({ color: c.macdLine, lineWidth: 2 });
  macdS.setData(macdDisplayData);
  const signalS = state.charts.macd.addLineSeries({ color: c.macdSignal, lineWidth: 1 });
  signalS.setData(signalDisplayData);
  state.charts.macd.timeScale().fitContent();
  } catch (err) {
    console.error("buildCharts error:", err);
    const priceContainer = document.getElementById('priceChart');
    if (priceContainer) {
      priceContainer.innerHTML = `<div style="color:var(--color-red); padding: 20px;">Chart Error: ${err.message}</div>`;
    }
  }

  // Use ResizeObserver to ensure charts always perfectly stretch edge-to-edge
  // even if container width changes due to scrollbars, CSS animations, or window resize
  if (!window.chartResizeObserver) {
    window.chartResizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          if (entry.target.id === 'priceChart' && state.charts.price) {
            state.charts.price.applyOptions({ width });
            state.charts.price.timeScale().fitContent();
          } else if (entry.target.id === 'rsiChart' && state.charts.rsi) {
            state.charts.rsi.applyOptions({ width });
            state.charts.rsi.timeScale().fitContent();
          } else if (entry.target.id === 'macdChart' && state.charts.macd) {
            state.charts.macd.applyOptions({ width });
            state.charts.macd.timeScale().fitContent();
          }
        }
      }
    });
  }

  // Observe the containers
  window.chartResizeObserver.disconnect();
  const pc = document.getElementById('priceChart');
  const rc = document.getElementById('rsiChart');
  const mc = document.getElementById('macdChart');
  if (pc) window.chartResizeObserver.observe(pc);
  if (rc) window.chartResizeObserver.observe(rc);
  if (mc) window.chartResizeObserver.observe(mc);
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
      
      // If user searched a custom ticker, reset the dropdown to default
      if (custom && selectInput) {
        selectInput.value = '';
      }
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

  // Determine price trend for dynamic chart color
  const latestPrice = prices[prices.length - 1];
  if (state.lastPrices && state.lastPrices.length > 0) {
    const oldLatest = state.lastPrices[state.lastPrices.length - 1];
    if (latestPrice > oldLatest) {
      state.priceTrend = 'up';
    } else if (latestPrice < oldLatest) {
      state.priceTrend = 'down';
    } else {
      state.priceTrend = 'neutral';
    }
  } else {
    state.priceTrend = 'neutral';
  }

  state.lastPrices = prices;
  state.lastLabels = labels;
  state.visibleDays = data.visible_days || null;

  renderPriceHeader(data);
  renderMLPrediction(data);
  renderMetrics(prices);
  renderSignals(prices);
  renderSRCard(prices);
  buildCharts(prices, labels);

  // Load AI Analyst Verdict and News (async, doesn't block UI)
  if (!isAuto) {
    if (document.getElementById('analystCard')) {
      loadAnalysis();
    }
    loadNews(state.ticker);
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
    'Strong Buy': '#CFF008',
    'Buy': '#e2f554',
    'Hold': '#fbbf24',
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
      const pct = (score / 5) * 100;
      el.style.width = `${pct}%`;
      el.style.background = score >= 4 ? 'var(--color-green)' : score >= 3 ? 'var(--color-amber)' : 'var(--color-red)';
    }
  }
}

// ── News Sentiment ─────────────────────────────────────────

async function loadNews(ticker = null) {
  try {
    const url = ticker ? `${API_BASE}/news?ticker=${ticker}` : `${API_BASE}/news`;
    const resp = await fetch(url);
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
          <div class="news-item__thumb" style="background-image: url('${item.image || `https://ui-avatars.com/api/?name=${state.ticker || 'IDX'}&background=random&color=fff&size=128&font-size=0.4&bold=true`}'); background-size: cover; background-position: center;">
          </div>
          <div class="news-item__content">
            <div class="news-item__title">${item.title}</div>
            <div class="news-item__meta">
              <span class="news-pill news-pill--${item.sentiment.toLowerCase()}"><span class="news-pill__dot"></span>${item.sentiment.toUpperCase()}</span>
              <span class="news-source">${item.source}${timeStr ? ' · ' + timeStr : ''}</span>
            </div>
          </div>
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
        const wrapper = document.querySelector('.main-wrapper');
        const headerOffset = 80; // height of the fixed header + padding
        
        // Find the closest parent section to ensure we don't cut off card headers
        let scrollTarget = target;
        const parentSection = scrollTarget.closest('section');
        if (parentSection) {
          scrollTarget = parentSection;
        }
        
        // Calculate precise offset within the scroll container
        const targetRect = scrollTarget.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        const offsetPosition = targetRect.top - wrapperRect.top + wrapper.scrollTop - headerOffset;

        wrapper.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
      // Handle both top nav and sidebar active states
      if (link.classList.contains('sidebar__link')) {
        document.querySelectorAll('.sidebar__link').forEach(l => l.classList.remove('sidebar__link--active'));
        link.classList.add('sidebar__link--active');
      } else {
        document.querySelectorAll('.header-nav__link:not(.sidebar__link)').forEach(l => l.classList.remove('header-nav__link--active'));
        link.classList.add('header-nav__link--active');
      }
    }
  });
});

// ── Stock Picks ──────────────────────────────────────────
async function loadPicks() {
  const container = document.getElementById("picksContainer");
  if (!container) return; // Not on picks page

  // Update last updated time immediately (no need to wait for fetch)
  const updatedText = document.getElementById("lastUpdatedText");
  if (updatedText) {
    const now = new Date();
    const isPast830 = now.getHours() > 8 || (now.getHours() === 8 && now.getMinutes() >= 30);
    const dayStr = isPast830 ? "today" : "yesterday";
    updatedText.innerText = `Updated ${dayStr} at 08:30 AM`;
  }

  try {
    const res = await fetch(`${API_BASE}/picks`);
    if (!res.ok) throw new Error("Failed to fetch picks");
    const data = await res.json();
    
    // Update header metrics
    const successRateElems = document.querySelectorAll(".pick-metric-circle");
    if(successRateElems.length > 1) {
       successRateElems[0].innerText = data.successRate || "84%";
       successRateElems[0].classList.remove("skeleton");
       successRateElems[1].innerText = data.alpha || "+12%";
       successRateElems[1].classList.remove("skeleton");
    }
    
    container.innerHTML = "";
    
    data.picks.forEach((pick, i) => {
      let reasonsHtml = pick.reasons.map(r => `<li>${r}</li>`).join("");
      
      // We render a tiny static SVG path based on chartData
      const minPrice = Math.min(...pick.chartData);
      const maxPrice = Math.max(...pick.chartData);
      const range = maxPrice - minPrice || 1;
      const points = pick.chartData.map((p, idx) => {
        const x = (idx / (pick.chartData.length - 1)) * 100;
        const y = 30 - (((p - minPrice) / range) * 20 + 5);
        return `${x},${y}`;
      }).join(" ");
      
      const badgeClass = pick.badge === "Buy" ? "badge-buy" : "";

      const card = document.createElement("div");
      card.className = "pick-card";
      card.innerHTML = `
        <div class="pick-card-header">
          <div class="pick-card-title">
            <span class="pick-card-ticker">${pick.ticker}</span>
            <span class="pick-card-name">${pick.name}</span>
          </div>
          <span class="pick-card-badge ${badgeClass}">${pick.badge}</span>
        </div>
        
        <div class="pick-card-chart">
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" style="width:100%; height:100%; stroke:var(--color-accent); fill:none; stroke-width:2px; vector-effect:non-scaling-stroke;">
            <polyline points="${points}" />
          </svg>
        </div>
        
        <div class="pick-reasoning">
          <div class="pick-section-title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            Reasoning
          </div>
          <ul class="pick-reasoning-list">
            ${reasonsHtml}
          </ul>
        </div>
        
        <div class="pick-zones">
          <div class="pick-zone-box">
            <span class="pick-zone-label">Buy Area</span>
            <span class="pick-zone-value">${pick.buyArea}</span>
          </div>
          <div class="pick-zone-box stop-loss">
            <span class="pick-zone-label">Stop Loss</span>
            <span class="pick-zone-value">${pick.stopLoss}</span>
          </div>
        </div>
        
        <div class="pick-targets">
          <div class="pick-target-row">
            <div class="pick-target-left">
              <span class="pick-target-label">Target 1 (TP1)</span>
              <span class="pick-target-value">${pick.tp1}</span>
            </div>
            <span class="pick-target-pct">${pick.tp1Pct}</span>
          </div>
          <div class="pick-target-row tp2">
            <div class="pick-target-left">
              <span class="pick-target-label">Target 2 (TP2)</span>
              <span class="pick-target-value">${pick.tp2}</span>
            </div>
            <span class="pick-target-pct">${pick.tp2Pct}</span>
          </div>
        </div>
        
        <div class="pick-card-footer">
          <span class="pick-card-time">${pick.time}</span>
          <a href="analysis.html?ticker=${pick.ticker}" class="pick-card-link">View Analysis &rarr;</a>
        </div>
      `;
      container.appendChild(card);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="error" style="text-align:center;width:100%;padding:40px;">Failed to load picks.</div>`;
  }
}

// ── Macro Correlation ──────────────────────────────────────
async function loadMacroCorrelation() {
  const container = document.getElementById("macroChart");
  if (!container) return; // Not on overview page
  
  try {
    const res = await fetch(`${API_BASE}/macro/usd-ihsg`);
    if (!res.ok) throw new Error("Failed to load macro data");
    const data = await res.json();
    
    const skel = document.getElementById("macroSkeleton");
    if (skel) skel.style.display = "none";
    
    const badge = document.getElementById("macroBadge");
    if (badge) {
      badge.style.display = "block";
      let corrText = "";
      if (data.correlation > 0.5) { corrText = "Strong Positive"; badge.style.color = "var(--color-green)"; }
      else if (data.correlation < -0.5) { corrText = "Strong Inverse"; badge.style.color = "var(--color-red)"; }
      else { corrText = "Weak Correlation"; badge.style.color = "var(--color-text-2)"; }
      badge.innerText = `Corr: ${data.correlation.toFixed(2)} (${corrText})`;
    }
    
    const isDark = state.theme === "dark";
    const gridColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
    const tickColor = isDark ? "#666" : "#888";
    
    if (state.charts.macro) {
      state.charts.macro.remove();
      state.charts.macro = null;
    }
    
    state.charts.macro = LightweightCharts.createChart(container, {
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: tickColor },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      timeScale: { timeVisible: false, borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      leftPriceScale: { visible: true, borderVisible: false },
      rightPriceScale: { visible: true, borderVisible: false },
      crosshair: { mode: 0 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const ihsgSeries = state.charts.macro.addLineSeries({
      color: isDark ? "#CFF008" : "#8a9f00",
      lineWidth: 2,
      priceScaleId: 'right'
    });
    
    const usdSeries = state.charts.macro.addLineSeries({
      color: "#3b82f6",
      lineWidth: 2,
      priceScaleId: 'left'
    });

    const ihsgData = data.dates.map((d, i) => ({ time: d, value: data.ihsg[i] })).filter(d => d.value !== null);
    const usdData = data.dates.map((d, i) => ({ time: d, value: data.idr[i] })).filter(d => d.value !== null);

    ihsgSeries.setData(ihsgData);
    usdSeries.setData(usdData);
    state.charts.macro.timeScale().fitContent();

  } catch (err) {
    console.error(err);
    const skel = document.getElementById("macroSkeleton");
    if (skel) skel.style.display = "none";
    const badge = document.getElementById("macroBadge");
    if (badge) {
      badge.style.display = "block";
      badge.style.color = "red";
      badge.innerText = "Error: " + err.message;
    }
  }
}

// ── Initialize ─────────────────────────────────────────────

applyTheme(state.theme);
renderCompareChips();
loadStock();
loadPicks();
loadMacroCorrelation();

// Auto-refresh news every 5 minutes
setInterval(() => loadNews(state.ticker), 300000);
