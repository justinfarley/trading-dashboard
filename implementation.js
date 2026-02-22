const ACCOUNT_CSV = 'account_history.csv';
const LOGS_JSON   = 'logs.json';
const TICKERS     = ['MSFT','CSCO','JPM','WMT','PG','XOM','TLT'];
const INITIAL_WEALTH_FALLBACK = 100000;

let wealthChart = null;

function fmt$(n) {
  if (n == null || isNaN(n)) return '—';
const abs = Math.abs(n);
  const formatted = '$' + abs.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});
  return n < 0 ? '-' + formatted : formatted;
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return sign + Number(n).toFixed(2) + '%';
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i]?.trim());
    return obj;
  });
}

async function loadAccountHistory() {
  try {
    const res = await fetch(ACCOUNT_CSV + '?t=' + Date.now());
    if (!res.ok) return null;
    const text = await res.text();
    return parseCSV(text);
  } catch(e) {
    return null;
  }
}

async function loadLogs() {
  try {
    const res = await fetch(LOGS_JSON + '?t=' + Date.now());
    if (!res.ok) return [];
    return await res.json();
  } catch(e) {
    return [];
  }
}

function renderStats(rows) {
  if (!rows || rows.length === 0) return;

  const first = rows[0];
  const last  = rows[rows.length - 1];

  const initialWealth = parseFloat(first.wealth) || INITIAL_WEALTH_FALLBACK;
  const currentWealth = parseFloat(last.wealth)  || 0;
  const totalReturn   = ((currentWealth - initialWealth) / initialWealth) * 100;

  // Wealth change from previous period
  let wealthChangeTxt = '—';
  let wealthChangeClass = '';
  if (rows.length >= 2) {
    const prev = parseFloat(rows[rows.length - 2].wealth) || 0;
    const diff = currentWealth - prev;
    const pct  = prev > 0 ? (diff / prev) * 100 : 0;
    wealthChangeTxt = (diff >= 0 ? '+' : '') + fmt$(diff) + ' (' + fmtPct(pct) + ') last period';
    wealthChangeClass = diff >= 0 ? 'up' : 'down';
  }

    document.getElementById('currentWealthLabel').innerHTML =
        'Current Wealth <span>Last Updated on Last Market Close</span>';
  document.getElementById('currentWealth').textContent = fmt$(currentWealth);
  const wSub = document.getElementById('wealthChange');
  wSub.textContent = wealthChangeTxt;
  wSub.className = 'stat-sub ' + wealthChangeClass;

  document.getElementById('totalReturnLabel').innerHTML = 
        'Total Return <span>Last Updated on Last Market Close</span>';
  const retEl = document.getElementById('totalReturn');
  dollarReturn = currentWealth - initialWealth;
  retEl.textContent = fmtPct(totalReturn) + ' / ' + fmt$(dollarReturn);
  retEl.style.color = totalReturn >= 0 ? 'var(--accent2)' : 'var(--danger)';
  document.getElementById('initialWealth').textContent = 'Started at ' + fmt$(initialWealth);
}

function renderChart(rows) {
  if (!rows || rows.length === 0) return;

  const labels = rows.map(r => r.date || '—');
  const data   = rows.map(r => parseFloat(r.wealth) || 0);
  const initial = data[0] || INITIAL_WEALTH_FALLBACK;

  document.getElementById('chartPeriods').textContent = rows.length + ' periods';

  const ctx = document.getElementById('wealthChart').getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(0,255,136,0.25)');
  gradient.addColorStop(1, 'rgba(0,255,136,0)');

  if (wealthChart) wealthChart.destroy();

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range   = maxVal - minVal;
  const padding = range < 1000 ? 500 : range * 0.1;

  wealthChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#00ff88',
        borderWidth: 2,
        backgroundColor: gradient,
        fill: true,
        pointRadius: data.length > 30 ? 0 : 3,
        pointBackgroundColor: '#00ff88',
        tension: 0.3
      }, {
        data: Array(data.length).fill(initial),
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d1117',
          borderColor: '#1a2332',
          borderWidth: 1,
          titleColor: '#c9d1d9',
          bodyColor: '#c9d1d9',
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => ' ' + fmt$(ctx.raw)
          }
        }
      },
      scales: {
        x: { display: false },
        y: {
          min: minVal - padding,
          max: maxVal + padding,
          grid: { color: 'rgba(26,35,50,0.6)' },
          ticks: {
            color: '#4a5568',
            font: { family: 'Share Tech Mono', size: 10 },
            callback: v => '$' + (v / 1000).toFixed(0) + 'k'
          },
          border: { display: false }
        }
      }
    }
  });
}

function renderWeights(rows) {
  if (!rows || rows.length === 0) return;

  const last = rows[rows.length - 1];
  const container = document.getElementById('weightsContainer');

  const weights = TICKERS.map(t => ({
    ticker: t,
    value: parseFloat(last[t]) || 0
  }));

  const colors = ['#00ff88','#0088ff','#ffaa00','#ff3b5c','#aa44ff','#00ccff','#ff6644'];

  container.innerHTML = weights.map((w, i) => `
    <div class="weight-row">
      <span class="weight-ticker">${w.ticker}</span>
      <div class="weight-bar-bg">
        <div class="weight-bar-fill" style="width:${(w.value*100).toFixed(1)}%;background:${colors[i%colors.length]}"></div>
      </div>
      <span class="weight-pct">${(w.value*100).toFixed(1)}%</span>
    </div>
  `).join('');
}

function renderPenalty(logs) {
  if (!logs || logs.length === 0) return;

  // get the most recent log entry that has a penalty
  const last = [...logs].reverse().find(l => l.penalty != null);
  if (!last) return;

  const penalty = parseFloat(last.penalty) || 0;
  const pct = Math.min(100, (penalty / 20) * 100);
  const fill = document.getElementById('penaltyFill');
  document.getElementById('penaltyLabel').textContent = "Most Recent Risk Penalty: " + last.penalty;
  fill.style.width = pct + '%';
  const color = penalty > 15 ? '#ff3b5c' : penalty > 8 ? '#ffaa00' : '#00ff88';
  fill.style.background = color;
  fill.style.boxShadow = `0 0 8px ${color}`;
}

function renderLogs(logs) {
  const tbody = document.getElementById('logBody');
  document.getElementById('logCount').textContent = logs.length + ' entries';

  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty-state">
        <span class="big">◌</span>
        No trade logs found. Run the trading script to populate.
      </div>
    </td></tr>`;
    return;
  }

  // most recent first
  const sorted = [...logs].reverse();

  tbody.innerHTML = sorted.map(log => {
    const action     = (log.action || '').toLowerCase();
    const badgeClass = action === 'buy' ? 'buy' : action === 'sell' ? 'sell' : 'rebalance';
    const qty        = log.qty   != null ? log.qty   : '—';
    const price      = log.price != null ? fmt$(log.price) : '—';
    const value      = (log.qty && log.price) ? fmt$(log.qty * log.price) : '—';
    const penalty    = log.penalty != null ? parseFloat(log.penalty).toFixed(2) : '—';
    const ts         = log.timestamp ? log.timestamp.replace('T', ' ').slice(0, 19) : '—';

    return `<tr>
      <td class="timestamp">${ts}</td>
      <td><span class="action-badge ${badgeClass}">${(log.action||'—').toUpperCase()}</span></td>
      <td class="ticker-cell">${log.ticker || '—'}</td>
      <td class="qty-cell">${qty}</td>
      <td class="price-cell">${price}</td>
      <td style="color:var(--warn)" class="price-cell">${value}</td>
    </tr>`;
  }).join('');
}

function updateLastUpdated() {
  const el = document.getElementById('lastUpdate');
  el.textContent = 'LAST SYNC: ' + new Date().toLocaleString().slice(0, 25).toUpperCase();
}

async function refresh() {
  const [rows, logs] = await Promise.all([loadAccountHistory(), loadLogs()]);

  renderStats(rows);
  renderChart(rows);
  renderWeights(rows);
  renderPenalty(logs);
  renderLogs(logs);
  updateLastUpdated();
}

refresh();
setInterval(refresh, 60000); // refresh every minute