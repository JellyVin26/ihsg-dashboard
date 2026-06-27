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

  // Bind filters
  document.querySelectorAll('.filter-cb').forEach(cb => cb.addEventListener('change', applyFilters));
  document.getElementById('peFilter').addEventListener('input', (e) => {
    document.getElementById('peValue').textContent = `0 - ${e.target.value}x`;
    applyFilters();
  });
  
  // Clear
  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.querySelectorAll('.filter-cb').forEach(cb => cb.checked = true);
    document.getElementById('peFilter').value = 50;
    document.getElementById('peValue').textContent = '0 - 50x';
    document.querySelectorAll('.filter-sector-btn').forEach(btn => btn.classList.remove('btn--active'));
    applyFilters();
  });

  // Fetch Data
  await fetchScreenerData();
});

async function fetchScreenerData() {
  try {
    const res = await fetch(`${API_BASE}/screener`);
    const data = await res.json();
    screenerData = data.data || [];
    
    // Inject sectors
    const sectors = [...new Set(screenerData.map(d => d.sector).filter(s => s && s !== 'Unknown'))];
    const sectorHtml = sectors.map(s => `<button class="btn btn--outline btn--sm filter-sector-btn" data-sector="${s}">${s.split(' ')[0]}</button>`).join('');
    document.getElementById('sectorFilters').innerHTML = sectorHtml;
    
    document.querySelectorAll('.filter-sector-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('btn--active');
        applyFilters();
      });
    });

    applyFilters();
  } catch (err) {
    document.getElementById('screenerResultsBody').innerHTML = `<div style="padding: 20px; color: red;">Failed to load screener data. Backend running?</div>`;
  }
}

function applyFilters() {
  const mcapCaps = Array.from(document.querySelectorAll('.filter-cb[data-filter="mcap"]:checked')).map(cb => cb.value);
  const maxPe = parseInt(document.getElementById('peFilter').value);
  
  const activeSectors = Array.from(document.querySelectorAll('.filter-sector-btn.btn--active')).map(b => b.dataset.sector);

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
  document.getElementById('matchCount').textContent = filteredData.length;
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
      <div class="screener-row" data-ticker="${d.ticker}" style="display: grid; grid-template-columns: 40px 2fr 1fr 1.5fr 1fr; padding: 12px 16px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); align-items: center; cursor: pointer; transition: 0.2s;">
        <div onclick="event.stopPropagation()">
          <input type="checkbox" class="compare-cb" data-ticker="${d.ticker}" ${compareSelection.includes(d.ticker) ? 'checked' : ''} style="accent-color: var(--color-accent); width: 16px; height: 16px; cursor: pointer;" />
        </div>
        <div>
          <div style="font-weight: 700; color: var(--color-text-1);">${d.ticker}</div>
          <div style="font-size: 11px; color: var(--color-text-3); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 150px;">${d.name} &bull; ${d.sector.split(' ')[0]}</div>
        </div>
        <div style="font-family: 'JetBrains Mono'; font-weight: 500;">${d.price.toLocaleString()}</div>
        <div style="display: flex; align-items: center; gap: 8px; color: ${color}; font-family: 'JetBrains Mono'; font-size: 13px;">
          ${isUp ? '+' : ''}${d.changePct.toFixed(2)}%
          ${sparkline}
        </div>
        <div style="font-size: 13px; color: var(--color-text-2);">Rp ${mcapStr}</div>
      </div>
    `;
  }).join('');

  // Bind clicks
  document.querySelectorAll('.screener-row').forEach(row => {
    row.addEventListener('click', () => loadConfidence(row.dataset.ticker));
  });

  document.querySelectorAll('.compare-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const t = e.target.dataset.ticker;
      if (e.target.checked) {
        if (compareSelection.length >= 2) {
          e.target.checked = false;
          alert("You can only compare 2 stocks at a time.");
          return;
        }
        compareSelection.push(t);
      } else {
        compareSelection = compareSelection.filter(x => x !== t);
      }
      updateCompare();
    });
  });
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

async function loadConfidence(ticker) {
  document.getElementById('confidenceVal').innerHTML = '<div class="loader" style="width:16px;height:16px;border:2px solid var(--color-border);border-top-color:var(--color-accent);border-radius:50%;animation:spin 1s linear infinite;"></div>';
  document.getElementById('confidenceTrend').textContent = ticker;
  document.getElementById('confidenceDesc').textContent = 'Running ML model...';
  
  // Highlight row
  document.querySelectorAll('.screener-row').forEach(r => r.style.borderColor = 'var(--color-border)');
  const activeRow = document.querySelector(`.screener-row[data-ticker="${ticker}"]`);
  if (activeRow) activeRow.style.borderColor = 'var(--color-accent)';

  try {
    const res = await fetch(`${API_BASE}/indicator/${ticker}`);
    const data = await res.json();
    
    if (data.prediction) {
      const isUp = data.prediction === 'UP';
      document.getElementById('confidenceVal').textContent = `${data.probability}%`;
      document.getElementById('confidenceRing').style.borderTopColor = isUp ? 'var(--color-up)' : 'var(--color-down)';
      document.getElementById('confidenceTrend').textContent = `${isUp ? 'Bullish' : 'Bearish'} Trend`;
      document.getElementById('confidenceTrend').style.color = isUp ? 'var(--color-up)' : 'var(--color-down)';
      document.getElementById('confidenceDesc').textContent = `System predicts continued ${isUp ? 'momentum' : 'weakness'} through tomorrow's session based on ${data.probability}% confidence interval.`;
    } else {
      throw new Error();
    }
  } catch (e) {
    document.getElementById('confidenceVal').textContent = '--%';
    document.getElementById('confidenceDesc').textContent = 'ML model unavailable for this ticker.';
  }
}
