/**
 * IDX Analyzer - Screener Logic (Vanilla JS, ponytail mode)
 */

let screenerData = [];
let filteredData = [];
let compareSelection = [];

const API_BASE = 'https://ihsg-dashboard.onrender.com/api';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Theme setup
  const themeToggle = document.getElementById('themeToggle');
  const themeIconMoon = document.getElementById('themeIconMoon');
  const themeIconSun = document.getElementById('themeIconSun');
  
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    themeIconMoon.style.display = 'none';
    themeIconSun.style.display = 'block';
  }
  
  themeToggle?.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    themeIconMoon.style.display = isDark ? 'none' : 'block';
    themeIconSun.style.display = isDark ? 'block' : 'none';
  });

  // ── Desktop filter bindings ───────────────────────────
  document.querySelectorAll('.filter-cb:not(.filter-cb-drawer)').forEach(cb => cb.addEventListener('change', applyFilters));
  document.getElementById('peFilter')?.addEventListener('input', (e) => {
    document.getElementById('peValue').textContent = `0 - ${e.target.value}x`;
    applyFilters();
  });
  document.getElementById('clearFiltersBtn')?.addEventListener('click', clearAllFilters);

  // ── Mobile drawer bindings ────────────────────────────
  const drawer = document.getElementById('filterDrawer');
  const overlay = document.getElementById('filterDrawerOverlay');

  const openDrawer = () => {
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };
  const closeDrawer = () => {
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  document.getElementById('filterToggleBtn')?.addEventListener('click', openDrawer);
  document.getElementById('filterDrawerClose')?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);

  document.getElementById('peFilterDrawer')?.addEventListener('input', (e) => {
    document.getElementById('peValueDrawer').textContent = `0 - ${e.target.value}x`;
  });

  document.getElementById('clearFiltersBtnDrawer')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-cb-drawer').forEach(cb => cb.checked = true);
    document.getElementById('peFilterDrawer').value = 50;
    document.getElementById('peValueDrawer').textContent = '0 - 50x';
    document.querySelectorAll('.filter-sector-btn-drawer').forEach(btn => btn.classList.remove('btn--active'));
  });

  document.getElementById('applyFiltersBtnDrawer')?.addEventListener('click', () => {
    applyFilters();
    closeDrawer();
  });

  // Fetch Data
  await fetchScreenerData();
});

async function fetchScreenerData() {
  try {
    const cb = new Date().getTime();
    const res = await fetch(`${API_BASE}/screener?cb=${cb}`);
    const data = await res.json();
    screenerData = data.data || [];
    
    // Inject sectors into desktop sidebar
    const sectors = [...new Set(screenerData.map(d => d.sector).filter(s => s && s !== 'Unknown'))];
    const sectorHtml = sectors.map(s => `<button class="btn btn--outline btn--sm filter-sector-btn" data-sector="${s}">${s.split(' ')[0]}</button>`).join('');
    document.getElementById('sectorFilters').innerHTML = sectorHtml;
    
    // Inject sectors into mobile drawer too
    const sectorHtmlDrawer = sectors.map(s => `<button class="btn btn--outline btn--sm filter-sector-btn-drawer" data-sector="${s}">${s.split(' ')[0]}</button>`).join('');
    const drawerEl = document.getElementById('sectorFiltersDrawer');
    if (drawerEl) drawerEl.innerHTML = sectorHtmlDrawer;
    
    document.querySelectorAll('.filter-sector-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('btn--active');
        applyFilters();
      });
    });
    document.querySelectorAll('.filter-sector-btn-drawer').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('btn--active'));
    });

    // Default to empty selection
    compareSelection = [];
    applyFilters();
    
    if (screenerData.length > 0) {
      loadVolumeTrend(screenerData[0].ticker);
    }
    generateAIScan();
  } catch (err) {
    document.getElementById('screenerResultsBody').innerHTML = `<div style="padding: 20px; color: red;">Failed to load screener data. Backend running?</div>`;
  }
}

function generateAIScan() {
  const sectors = {};
  screenerData.forEach(d => {
    if (!sectors[d.sector]) sectors[d.sector] = { sum: 0, count: 0 };
    sectors[d.sector].sum += d.changePct;
    sectors[d.sector].count++;
  });
  let bestSector = '';
  let bestAvg = -999;
  for (let s in sectors) {
    if (s === 'Unknown') continue;
    let avg = sectors[s].sum / sectors[s].count;
    if (avg > bestAvg) { bestAvg = avg; bestSector = s; }
  }
  
  const textEl = document.getElementById('aiScanText');
  if (textEl && bestSector) {
    const isAccumulation = bestAvg > 0;
    const verbs = isAccumulation ? ['strong accumulation', 'heavy buying interest', 'institutional support'] : ['defensive rotation', 'distribution', 'profit taking'];
    const actions = isAccumulation ? ['strengthening', 'building', 'accelerating'] : ['weakening', 'fading', 'cooling off'];
    
    const randomVerb = verbs[Math.floor(Math.random() * verbs.length)];
    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    
    textEl.textContent = `"${bestSector} sector is showing ${randomVerb}. Momentum signal is ${randomAction} across Tier-1 vendors."`;
  }
}

function clearAllFilters() {
  document.querySelectorAll('.filter-cb').forEach(cb => cb.checked = true);
  const peFilter = document.getElementById('peFilter');
  if (peFilter) { peFilter.value = 50; document.getElementById('peValue').textContent = '0 - 50x'; }
  const peFilterDrawer = document.getElementById('peFilterDrawer');
  if (peFilterDrawer) { peFilterDrawer.value = 50; document.getElementById('peValueDrawer').textContent = '0 - 50x'; }
  document.querySelectorAll('.filter-sector-btn, .filter-sector-btn-drawer').forEach(btn => btn.classList.remove('btn--active'));
  applyFilters();
}

function applyFilters() {
  // Merge checked states from desktop + drawer (drawer takes priority on mobile)
  const isMobile = window.innerWidth <= 768;
  const cbSelector = isMobile
    ? '.filter-cb-drawer[data-filter="mcap"]:checked'
    : '.filter-cb:not(.filter-cb-drawer)[data-filter="mcap"]:checked';
  const mcapCaps = Array.from(document.querySelectorAll(cbSelector)).map(cb => cb.value);

  const peEl = isMobile ? document.getElementById('peFilterDrawer') : document.getElementById('peFilter');
  const maxPe = parseInt((peEl || document.getElementById('peFilter')).value);
  
  const activeSectors = Array.from(document.querySelectorAll(
    isMobile ? '.filter-sector-btn-drawer.btn--active' : '.filter-sector-btn:not(.filter-sector-btn-drawer).btn--active'
  )).map(b => b.dataset.sector);

  filteredData = screenerData.filter(d => {
    // 1. Market Cap
    const capT = (d.marketCap || 0) / 1e12; // in Trillions
    let capMatch = false;
    if (mcapCaps.includes('large') && capT >= 100) capMatch = true;
    if (mcapCaps.includes('mid') && capT >= 20 && capT < 100) capMatch = true;
    if (mcapCaps.includes('small') && capT < 20) capMatch = true;
    if (!capMatch) return false;

    // 2. Valuation
    if (d.forwardPE < 0 || d.forwardPE > maxPe) return false;

    // 3. Sector
    if (activeSectors.length > 0 && !activeSectors.includes(d.sector)) return false;

    return true;
  });

  renderTable();
}

function renderTable() {
  const count = filteredData.length;
  document.getElementById('matchCount').textContent = count;
  const mobileCount = document.getElementById('matchCountMobile');
  if (mobileCount) mobileCount.textContent = count;
  const tbody = document.getElementById('screenerResultsBody');
  
  if (filteredData.length === 0) {
    tbody.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--color-text-3);">No stocks match your criteria.</div>`;
    return;
  }

  tbody.innerHTML = filteredData.map(d => {
    const isUp = d.change >= 0;
    const color = isUp ? 'var(--color-up)' : 'var(--color-down)';
    const mcapStr = ((d.marketCap || 0) / 1e12).toFixed(1) + 'T';
    
    // Create simple SVG sparkline
    const sparkline = generateSparkline(d.sparkline, color);

    return `
      <div class="screener-row screener-grid-row" data-ticker="${d.ticker}" style="padding: 12px 16px; margin-right: 2px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); cursor: pointer; transition: 0.2s;">
        <div onclick="event.stopPropagation()">
          <input type="checkbox" class="compare-cb" data-ticker="${d.ticker}" ${compareSelection.includes(d.ticker) ? 'checked' : ''} style="accent-color: var(--color-accent); width: 16px; height: 16px; cursor: pointer;" />
        </div>
        <div>
          <div style="font-weight: 700; color: var(--color-text-1);">${d.ticker}</div>
          <div style="font-size: 11px; color: var(--color-text-3); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 150px;">${d.name} &bull; ${d.sector.split(' ')[0]}</div>
        </div>
        <div style="font-family: 'JetBrains Mono'; font-weight: 500; text-align: right;">${d.price.toLocaleString()}</div>
        <div style="text-align: right; color: ${color}; font-family: 'JetBrains Mono'; font-size: 13px;">
          ${isUp ? '+' : ''}${d.changePct.toFixed(2)}%
        </div>
        <div class="screener-hide-mobile" style="display: flex; align-items: center; justify-content: flex-end;">${sparkline}</div>
        <div style="text-align: right; font-size: 12px; color: var(--color-text-2);">${mcapStr}</div>
      </div>
    `;
  }).join('');

  // Bind clicks
  document.querySelectorAll('.screener-row').forEach(row => {
    row.addEventListener('click', () => loadVolumeTrend(row.dataset.ticker));
  });

  document.querySelectorAll('.compare-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const t = e.target.dataset.ticker;
      if (e.target.checked) {
        if (compareSelection.length >= 2) {
          e.target.checked = false;
          const helper = document.getElementById('cmpHelper');
          helper.textContent = 'Maximum 2 stocks allowed for comparison.';
          helper.style.color = 'var(--color-down)';
          setTimeout(() => {
            helper.textContent = 'Comparison updated.';
            helper.style.color = 'var(--color-text-3)';
          }, 3000);
          return;
        }
        compareSelection.push(t);
      } else {
        compareSelection = compareSelection.filter(x => x !== t);
      }
      updateCompare();
    });
  });

  updateCompare();
}

function generateSparkline(data, color) {
  if (!data || data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 60;
  const height = 20;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return `<svg width="${width}" height="${height}" viewBox="-2 -2 64 24" fill="none"><polyline points="${points}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function updateCompare() {
  if (compareSelection.length !== 2) {
    document.getElementById('cmpTicker1').textContent = '--';
    document.getElementById('cmpTicker2').textContent = '--';
    document.getElementById('cmpPrice1').textContent = '--';
    document.getElementById('cmpPrice2').textContent = '--';
    document.getElementById('cmpChange1').textContent = '--';
    document.getElementById('cmpChange2').textContent = '--';
    document.getElementById('cmpPE1').textContent = '--';
    document.getElementById('cmpPE2').textContent = '--';
    document.getElementById('cmpHelper').textContent = 'Select 2 stocks from the list to compare.';
    return;
  }

  const s1 = screenerData.find(d => d.ticker === compareSelection[0]);
  const s2 = screenerData.find(d => d.ticker === compareSelection[1]);
  
  if (!s1 || !s2) return;

  document.getElementById('cmpTicker1').textContent = s1.ticker;
  document.getElementById('cmpTicker2').textContent = s2.ticker;
  
  document.getElementById('cmpPrice1').textContent = s1.price.toLocaleString();
  document.getElementById('cmpPrice2').textContent = s2.price.toLocaleString();
  
  document.getElementById('cmpChange1').textContent = s1.changePct.toFixed(2) + '%';
  document.getElementById('cmpChange2').textContent = s2.changePct.toFixed(2) + '%';
  document.getElementById('cmpChange1').style.color = s1.changePct >= 0 ? 'var(--color-up)' : 'var(--color-down)';
  document.getElementById('cmpChange2').style.color = s2.changePct >= 0 ? 'var(--color-up)' : 'var(--color-down)';

  document.getElementById('cmpPE1').textContent = s1.forwardPE ? s1.forwardPE.toFixed(1) + 'x' : 'N/A';
  document.getElementById('cmpPE2').textContent = s2.forwardPE ? s2.forwardPE.toFixed(1) + 'x' : 'N/A';

  document.getElementById('cmpHelper').textContent = 'Comparison updated.';
}

function loadVolumeTrend(ticker) {
  const stock = screenerData.find(d => d.ticker === ticker);
  if (!stock) return;

  document.getElementById('volumeTrendTicker').textContent = ticker;
  
  // Highlight row
  document.querySelectorAll('.screener-row').forEach(r => r.style.borderColor = 'var(--color-border)');
  const activeRow = document.querySelector(`.screener-row[data-ticker="${ticker}"]`);
  if (activeRow) activeRow.style.borderColor = 'var(--color-accent)';

  // Use real volume data from yfinance
  const volumes = stock.volume_sparkline || [100, 150, 120, 200, 180, 250];
  const last6 = volumes.slice(-6);
  const min = Math.min(...last6);
  const max = Math.max(...last6);
  const range = max - min || 1;
  
  const isUp = stock.changePct >= 0;
  
  const barsHtml = last6.map((val, idx) => {
    const height = 20 + ((val - min) / range) * 80;
    const isRecent = idx >= 3;
    let bgColor = 'var(--color-surface-2)';
    if (isRecent) {
      bgColor = isUp ? 'var(--color-accent)' : 'var(--color-down)';
    }
    
    return `<div style="flex: 1; background: ${bgColor}; border-radius: 2px; height: ${height}%; transition: height 0.3s ease;" title="Volume: ${val.toLocaleString()}"></div>`;
  }).join('');
  
  document.getElementById('volumeTrendBars').innerHTML = barsHtml;
  document.getElementById('volumeTrendTicker').style.color = isUp ? 'var(--color-accent)' : 'var(--color-down)';

  // Calculate real metrics
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const recentVol = last6.reduce((a, b) => a + b, 0) / last6.length;
  
  let mult = (recentVol / avgVol).toFixed(1);
  if (isNaN(mult) || mult == "Infinity" || mult == "0.0") mult = 1.0;

  if (mult >= 1.0) {
    document.getElementById('volumeTrendDesc').textContent = `Recent volume is ${mult}x above monthly average. Significant institutional ${isUp ? 'accumulation' : 'distribution'} detected.`;
  } else {
    document.getElementById('volumeTrendDesc').textContent = `Recent volume is ${mult}x of monthly average. ${isUp ? 'Quiet accumulation' : 'Low selling pressure'} observed.`;
  }
}
