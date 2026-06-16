// ── Constants ──────────────────────────────────────────────────────────────
const TICKER_META = {
  IHSG: { label: '^JKSE',    base: 7142,  vol: 80  },
  BBCA: { label: 'BBCA.JK',  base: 9875,  vol: 120 },
  BBRI: { label: 'BBRI.JK',  base: 5200,  vol: 90  },
  TLKM: { label: 'TLKM.JK',  base: 3560,  vol: 60  },
  ASII: { label: 'ASII.JK',  base: 4800,  vol: 75  },
  GOTO: { label: 'GOTO.JK',  base: 88,    vol: 6   },
  BMRI: { label: 'BMRI.JK',  base: 7200,  vol: 95  },
  UNVR: { label: 'UNVR.JK',  base: 2850,  vol: 45  },
};

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  ticker: 'IHSG',
  period: 30,
  indicators: { ma20: true, ma50: true, bb: true },
  charts: { price: null, rsi: null, macd: null },
};

// ── Seeded RNG (reproducible "demo" data per ticker) ───────────────────────
function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 0xffffffff;
  };
}

function generatePrices(base, vol, n, seedStr) {
  const seed = [...seedStr].reduce((acc, c) => acc + c.charCodeAt(0) * 31, 0);
  const rand = seededRng(seed);
  const prices = [base];
  for (let i = 1; i < n; i++) {
    const drift = (rand() - 0.485) * vol;
    prices.push(Math.max(prices[i - 1] + drift, base * 0.45));
  }
  return prices;
}

// ── Technical indicators ───────────────────────────────────────────────────
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
    if (ma[i] === null) return { upper: null, lower: null, mid: null };
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = ma[i];
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    return { upper: mean + k * std, lower: mean - k * std, mid: mean };
  });
}

function rsi(prices, period = 14) {
  const result = new Array(period).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  result.push(100 - 100 / (1 + avgGain / (avgLoss || 1e-9)));
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
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

// ── Date labels ────────────────────────────────────────────────────────────
function getDateLabels(n) {
  const labels = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
  }
  return labels;
}

// ── Render metrics ─────────────────────────────────────────────────────────
function renderMetrics(prices) {
  const last  = prices[prices.length - 1];
  const prev  = prices[prices.length - 2];
  const ma20v = sma(prices, 20);
  const ma50v = sma(prices, 50);
  const rsiV  = rsi(prices);

  const curMA20 = ma20v[ma20v.length - 1] ?? 0;
  const curMA50 = ma50v[ma50v.length - 1] ?? 0;
  const curRSI  = rsiV[rsiV.length - 1]   ?? 0;
  const change  = last - prev;
  const changePct = (change / prev) * 100;

  // Price header
  document.getElementById('priceDisplay').textContent =
    last.toLocaleString('id-ID', { maximumFractionDigits: 0 });

  const chEl = document.getElementById('changeDisplay');
  chEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(0)} (${change >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
  chEl.className = 'change ' + (change >= 0 ? 'change--up' : 'change--down');

  const high20 = Math.max(...prices.slice(-20));
  const low20  = Math.min(...prices.slice(-20));

  const items = [
    { label: '20D High', val: high20.toLocaleString('id-ID', { maximumFractionDigits: 0 }), sub: '' },
    { label: '20D Low',  val: low20.toLocaleString('id-ID',  { maximumFractionDigits: 0 }), sub: '' },
    { label: 'MA 20',    val: curMA20.toLocaleString('id-ID', { maximumFractionDigits: 0 }), sub: last > curMA20 ? '↑ above' : '↓ below' },
    { label: 'MA 50',    val: curMA50.toLocaleString('id-ID', { maximumFractionDigits: 0 }), sub: last > curMA50 ? '↑ above' : '↓ below' },
    { label: 'RSI 14',   val: curRSI.toFixed(1), sub: curRSI > 70 ? 'Overbought' : curRSI < 30 ? 'Oversold' : 'Neutral' },
  ];

  document.getElementById('metricsRow').innerHTML = items.map(m => `
    <div class="metric">
      <div class="metric__label">${m.label}</div>
      <div class="metric__val">${m.val}</div>
      ${m.sub ? `<div class="metric__sub">${m.sub}</div>` : ''}
    </div>
  `).join('');

  return { last, prev, change, changePct, curMA20, curMA50, curRSI };
}

// ── Render signals ─────────────────────────────────────────────────────────
function renderSignals(prices) {
  const last = prices[prices.length - 1];
  const rsiV = rsi(prices);
  const curRSI = rsiV[rsiV.length - 1];

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
      name: 'RSI momentum',
      val: curRSI.toFixed(1),
      action: curRSI > 70 ? 'sell' : curRSI < 30 ? 'buy' : 'neutral',
      desc: curRSI > 70 ? 'Overbought zone' : curRSI < 30 ? 'Oversold zone' : 'Neutral range (30–70)',
    },
    {
      name: 'MA crossover',
      val: `${curMA20.toFixed(0)} / ${curMA50.toFixed(0)}`,
      action: prevMA20 < prevMA50 && curMA20 > curMA50
        ? 'buy'
        : prevMA20 > prevMA50 && curMA20 < curMA50
        ? 'sell'
        : curMA20 > curMA50 ? 'buy' : 'sell',
      desc: curMA20 > curMA50 ? 'MA20 above MA50 (bullish)' : 'MA20 below MA50 (bearish)',
    },
    {
      name: 'MACD signal',
      val: curMACD.toFixed(2),
      action: prevMACD < prevSig && curMACD > curSig
        ? 'buy'
        : prevMACD > prevSig && curMACD < curSig
        ? 'sell'
        : curMACD > curSig ? 'buy' : 'neutral',
      desc: curMACD > curSig ? 'MACD above signal line' : 'MACD below signal line',
    },
    {
      name: 'Bollinger band',
      val: last.toFixed(0),
      action: lastBB.lower && last < lastBB.lower
        ? 'buy'
        : lastBB.upper && last > lastBB.upper
        ? 'sell'
        : 'neutral',
      desc: lastBB.lower && last < lastBB.lower
        ? 'Below lower band'
        : lastBB.upper && last > lastBB.upper
        ? 'Above upper band'
        : 'Inside Bollinger bands',
    },
    {
      name: 'Price vs MA50',
      val: ((last / curMA50 - 1) * 100).toFixed(2) + '%',
      action: last > curMA50 * 1.02 ? 'buy' : last < curMA50 * 0.98 ? 'sell' : 'neutral',
      desc: last > curMA50 ? 'Trading above MA50' : 'Trading below MA50',
    },
    {
      name: '5-day trend',
      val: upDays + '/5 up days',
      action: upDays >= 3 ? 'buy' : upDays <= 1 ? 'sell' : 'neutral',
      desc: upDays >= 3 ? 'Short-term uptrend' : upDays <= 1 ? 'Short-term downtrend' : 'Sideways movement',
    },
  ];

  document.getElementById('signalGrid').innerHTML = signals.map(s => `
    <div class="signal-card">
      <div class="signal-card__name">${s.name}</div>
      <div class="signal-card__val signal-card__val--${s.action}">${s.val}</div>
      <span class="badge badge--${s.action}">${s.action.toUpperCase()}</span>
      <div class="signal-card__desc">${s.desc}</div>
    </div>
  `).join('');
}

// ── Build / rebuild charts ─────────────────────────────────────────────────
function buildCharts(prices, labels) {
  const ma20v = sma(prices, 20);
  const ma50v = sma(prices, 50);
  const bb = bollingerBands(prices);
  const rsiV = rsi(prices);
  const { macdLine, signalLine, histogram } = macd(prices);

  const { charts, indicators } = state;
  if (charts.price) charts.price.destroy();
  if (charts.rsi)   charts.rsi.destroy();
  if (charts.macd)  charts.macd.destroy();

  const gridColor = 'rgba(136,135,128,0.12)';
  const tickColor = '#9a9990';
  const baseAxisOpts = {
    ticks: { color: tickColor, font: { size: 11 } },
    grid:  { color: gridColor },
  };
  const basePlugins = {
    legend: { display: false },
    tooltip: { mode: 'index', intersect: false },
  };
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: basePlugins,
    scales: { x: { ...baseAxisOpts, ticks: { ...baseAxisOpts.ticks, maxTicksLimit: 8 } }, y: baseAxisOpts },
  };

  // ── Price chart datasets
  const priceSets = [
    {
      label: 'Price',
      data: prices,
      borderColor: '#185FA5',
      backgroundColor: 'rgba(24,95,165,0.06)',
      borderWidth: 1.8,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
      order: 3,
    },
  ];
  if (indicators.ma20) priceSets.push({
    label: 'MA 20', data: ma20v, borderColor: '#378ADD',
    borderWidth: 1.2, borderDash: [5, 3], pointRadius: 0, fill: false, tension: 0.3, order: 2,
  });
  if (indicators.ma50) priceSets.push({
    label: 'MA 50', data: ma50v, borderColor: '#D85A30',
    borderWidth: 1.2, borderDash: [7, 3], pointRadius: 0, fill: false, tension: 0.3, order: 2,
  });
  if (indicators.bb) {
    priceSets.push({
      label: 'BB Upper', data: bb.map(b => b.upper),
      borderColor: '#B4B2A9', borderWidth: 0.8, borderDash: [2, 3],
      pointRadius: 0, fill: '+1', backgroundColor: 'rgba(136,135,128,0.05)', tension: 0.3, order: 1,
    });
    priceSets.push({
      label: 'BB Lower', data: bb.map(b => b.lower),
      borderColor: '#B4B2A9', borderWidth: 0.8, borderDash: [2, 3],
      pointRadius: 0, fill: false, tension: 0.3, order: 1,
    });
  }

  charts.price = new Chart(document.getElementById('priceChart'), {
    type: 'line',
    data: { labels, datasets: priceSets },
    options: { ...baseOpts },
  });

  // ── RSI chart
  charts.rsi = new Chart(document.getElementById('rsiChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'RSI',
        data: rsiV,
        borderColor: '#534AB7',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.3,
      }],
    },
    options: {
      ...baseOpts,
      scales: {
        x: { ...baseAxisOpts, ticks: { ...baseAxisOpts.ticks, maxTicksLimit: 6 } },
        y: { ...baseAxisOpts, min: 0, max: 100,
          ticks: { ...baseAxisOpts.ticks, callback: v => `${v}` } },
      },
    },
  });

  // ── MACD chart
  charts.macd = new Chart(document.getElementById('macdChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'line', label: 'MACD',
          data: macdLine, borderColor: '#1D9E75', borderWidth: 1.5,
          pointRadius: 0, fill: false, tension: 0.3, order: 1,
        },
        {
          type: 'line', label: 'Signal',
          data: signalLine, borderColor: '#D85A30', borderWidth: 1.2,
          borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3, order: 1,
        },
        {
          label: 'Histogram',
          data: histogram,
          backgroundColor: histogram.map(v => v >= 0 ? 'rgba(29,158,117,0.45)' : 'rgba(216,90,48,0.45)'),
          borderWidth: 0,
          order: 2,
        },
      ],
    },
    options: { ...baseOpts, scales: {
      x: { ...baseAxisOpts, ticks: { ...baseAxisOpts.ticks, maxTicksLimit: 6 } },
      y: baseAxisOpts,
    }},
  });

  state.charts = charts;
}

// ── Main load ──────────────────────────────────────────────────────────────
function loadStock() {
  const custom = document.getElementById('customTicker').value.trim().toUpperCase();
  const select = document.getElementById('stockSelect').value;
  state.ticker = custom || select;

  const meta = TICKER_META[state.ticker] ?? { label: state.ticker + '.JK', base: 5000, vol: 80 };
  document.getElementById('tickerLabel').textContent = meta.label;

  const buffer = 60; // extra history for accurate indicator warm-up
  const totalN = state.period + buffer;
  const allPrices = generatePrices(meta.base, meta.vol, totalN, state.ticker);
  const prices = allPrices.slice(-state.period - 20);
  const labels = getDateLabels(prices.length);

  renderMetrics(prices);
  renderSignals(prices);
  buildCharts(prices, labels);
}

// ── Event listeners ────────────────────────────────────────────────────────
document.getElementById('loadBtn').addEventListener('click', loadStock);

document.getElementById('stockSelect').addEventListener('change', () => {
  document.getElementById('customTicker').value = '';
  loadStock();
});

document.getElementById('customTicker').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadStock();
});

document.querySelectorAll('.ctrl-btn[data-period]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ctrl-btn[data-period]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.period = parseInt(btn.dataset.period);
    loadStock();
  });
});

document.querySelectorAll('.chip[data-ind]').forEach(chip => {
  chip.addEventListener('click', () => {
    const ind = chip.dataset.ind;
    state.indicators[ind] = !state.indicators[ind];
    chip.classList.toggle('chip--on', state.indicators[ind]);
    loadStock();
  });
});

// ── Init ───────────────────────────────────────────────────────────────────
loadStock();
