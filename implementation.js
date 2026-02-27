const ACCOUNT_CSV = 'account_history.csv';
const LOGS_JSON = 'logs.json';
const TICKERS = ['MSFT', 'CSCO', 'JPM', 'WMT', 'PG', 'XOM', 'TLT'];
const INITIAL_WEALTH_FALLBACK = 100000;

let wealthChart = null;
let dailyChart = null;
let activeTab = 'biweekly';
let hasAnimated = false;

let weightsChart = null;
let activeWeightsTab = 'latest';

function switchWeightsTab(tab) {
    activeWeightsTab = tab;
    document.getElementById('tabWeightsLatest').classList.toggle('active', tab === 'latest');
    document.getElementById('tabWeightsHistory').classList.toggle('active', tab === 'history');
    document.getElementById('weightsLatestView').style.display = tab === 'latest' ? 'block' : 'none';
    document.getElementById('weightsHistoryView').style.display = tab === 'history' ? 'block' : 'none';
}

function renderWeightsChart(rows) {
    if (!rows || rows.length === 0) return;

    const labels = rows.map((r, i) => r.date ? r.date.slice(0, 10) : 'P' + i);
    const colors = ['#00ff88', '#0088ff', '#ffaa00', '#ff3b5c', '#aa44ff', '#00ccff', '#ff6644'];

    const datasets = TICKERS.map((ticker, i) => ({
        label: ticker,
        data: rows.map(r => parseFloat(r[ticker]) * 100 || 0),
        borderColor: colors[i % colors.length],
        borderWidth: 2,
        pointRadius: rows.length > 20 ? 0 : 3,
        pointBackgroundColor: colors[i % colors.length],
        tension: 0.3,
        fill: false
    }));

    const ctx = document.getElementById('weightsChart').getContext('2d');
    if (weightsChart) weightsChart.destroy();

    weightsChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#4a5568',
                        font: { family: 'Share Tech Mono', size: 9 },
                        boxWidth: 12,
                        padding: 8
                    }
                },
                tooltip: {
                    backgroundColor: '#0d1117',
                    borderColor: '#1a2332',
                    borderWidth: 1,
                    titleColor: '#c9d1d9',
                    bodyColor: '#c9d1d9',
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`
                    }
                }
            },
            scales: {
                x: { display: false },
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(26,35,50,0.6)' },
                    ticks: {
                        color: '#4a5568',
                        font: { family: 'Share Tech Mono', size: 10 },
                        maxTicksLimit: 6,
                        callback: v => v + '%'
                    },
                    border: { display: false }
                }
            }
        }
    });
}

function fmt$(n) {
    if (n == null || isNaN(n)) return '—';
    const abs = Math.abs(n);
    const formatted = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

async function loadWealthCSV() {
    try {
        const res = await fetch('wealth_live.csv?t=' + Date.now());
        if (!res.ok) return { wealth: null, timestamp: null };
        const text = await res.text();
        const lines = text.trim().split('\n').filter(l => l.trim());
        const last = lines[lines.length - 1].split(',');
        return {
            wealth: parseFloat(last[1]) || null,
            timestamp: last[0]?.trim() || null
        };
    } catch (e) {
        return { wealth: null, timestamp: null };
    }
}

async function loadDailyCSV() {
    try {
        const res = await fetch('wealth.csv?t=' + Date.now());
        if (!res.ok) return [];
        const text = await res.text();
        return text.trim().split('\n').map(line => {
            const parts = line.split(',');
            return { date: parts[0].trim(), wealth: parseFloat(parts[1]) };
        }).filter(r => !isNaN(r.wealth));
    } catch (e) {
        return [];
    }
}

async function loadAccountHistory() {
    try {
        const res = await fetch(ACCOUNT_CSV + '?t=' + Date.now());
        if (!res.ok) return null;
        const text = await res.text();
        return parseCSV(text);
    } catch (e) {
        return null;
    }
}

async function loadLogs() {
    try {
        const res = await fetch(LOGS_JSON + '?t=' + Date.now());
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        return [];
    }
}

function animateCounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    const duration = 1200;
    const start = performance.now();

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = startValue + (targetValue - startValue) * eased;
        const abs = Math.abs(current);
        el.textContent = (current < 0 ? '-$' : '$') + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (progress < 1) requestAnimationFrame(update);
    }

    const startValue = 0;
    requestAnimationFrame(update);
}

function renderStats(rows, wealth, timestamp) {
    if (!rows || rows.length === 0) return;

    const timestampTxt = timestamp ? `${timestamp}` : 'Last Updated on Previous Market Close';

    const first = rows[0];
    const last = rows[rows.length - 1];

    const initialWealth = parseFloat(first.wealth) || INITIAL_WEALTH_FALLBACK;
    const currentWealth = wealth || 0;
    const totalReturn = ((currentWealth - initialWealth) / initialWealth) * 100;

    // Wealth change from previous period
    let wealthChangeTxt = '—';
    let wealthChangeClass = '';
    if (rows.length >= 2) {
        const prev = parseFloat(rows[rows.length - 2].wealth) || 0;
        const diff = currentWealth - prev;
        const pct = prev > 0 ? (diff / prev) * 100 : 0;
        wealthChangeTxt = (diff >= 0 ? '+' : '') + fmt$(diff) + ' (' + fmtPct(pct) + ') last period';
        wealthChangeClass = diff >= 0 ? 'up' : 'down';
    }

    document.getElementById('currentWealthLabel').innerHTML =
        'Current Wealth <span>Last Updated at ' + timestampTxt + '</span>';

    if (!hasAnimated) {
        animateCounter('currentWealth', currentWealth);
        hasAnimated = true;
    } else {
        document.getElementById('currentWealth').textContent = fmt$(currentWealth);
    }
    const wSub = document.getElementById('wealthChange');
    wSub.textContent = wealthChangeTxt;
    wSub.className = 'stat-sub ' + wealthChangeClass;

    document.getElementById('totalReturnLabel').innerHTML =
        'Total Return <span>Last Updated at ' + timestampTxt + '</span>';
    const retEl = document.getElementById('totalReturn');
    dollarReturn = currentWealth - initialWealth;
    retEl.textContent = fmtPct(totalReturn) + ' / ' + fmt$(dollarReturn);
    retEl.style.color = totalReturn >= 0 ? 'var(--accent2)' : 'var(--danger)';
    document.getElementById('initialWealth').textContent = 'Started at ' + fmt$(initialWealth);
}

function switchTab(tab) {
    activeTab = tab;
    document.getElementById('tabBiweekly').classList.toggle('active', tab === 'biweekly');
    document.getElementById('tabDaily').classList.toggle('active', tab === 'daily');
    refresh();
}

function renderChart(rows) {
    if (!rows || rows.length === 0) return;

    const labels = rows.map(r => r.date || '—');
    const data = rows.map(r => parseFloat(r.wealth) || 0);
    const initial = data[0] || INITIAL_WEALTH_FALLBACK;

    document.getElementById('chartPeriods').textContent = rows.length + ' periods';

    const ctx = document.getElementById('wealthChart').getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0,255,136,0.25)');
    gradient.addColorStop(1, 'rgba(0,255,136,0)');

    if (wealthChart) wealthChart.destroy();

    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = maxVal - minVal;
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
                        maxTicksLimit: 6,
                        callback: v => '$' + (v / 1000).toFixed(1) + 'k'
                    },
                    border: { display: false }
                }
            }
        }
    });
}

function renderDailyChart(rows) {
    if (!rows || rows.length === 0) return;

    const labels = rows.map(r => r.date.slice(0, 10));
    const data = rows.map(r => r.wealth);
    const initial = data[0] || INITIAL_WEALTH_FALLBACK;

    const ctx = document.getElementById('wealthChart').getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0,136,255,0.25)');
    gradient.addColorStop(1, 'rgba(0,136,255,0)');

    if (wealthChart) wealthChart.destroy();

    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = maxVal - minVal;
    const padding = range < 1000 ? 500 : range * 0.1;

    wealthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data,
                borderColor: '#0088ff',
                borderWidth: 2,
                backgroundColor: gradient,
                fill: true,
                pointRadius: data.length > 30 ? 0 : 3,
                pointBackgroundColor: '#0088ff',
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
                        callback: v => '$' + (v / 1000).toFixed(1) + 'k'
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

    const colors = ['#00ff88', '#0088ff', '#ffaa00', '#ff3b5c', '#aa44ff', '#00ccff', '#ff6644'];

    container.innerHTML = weights.map((w, i) => `
    <div class="weight-row">
      <span class="weight-ticker">${w.ticker}</span>
      <div class="weight-bar-bg">
        <div class="weight-bar-fill" style="width:${(w.value * 100).toFixed(1)}%;background:${colors[i % colors.length]}"></div>
      </div>
      <span class="weight-pct">${(w.value * 100).toFixed(1)}%</span>
    </div>
  `).join('');
}

function renderPenalty(logs) {
    if (!logs || logs.length === 0) return;

    const withPenalty = [...logs].reverse().filter(l => l.penalty != null);
    if (withPenalty.length === 0) return;

    const colors = p => p > 15 ? '#ff3b5c' : p > 8 ? '#ffaa00' : '#00ff88';

    // Most recent
    const latest = withPenalty[0];
    const penalty = parseFloat(latest.penalty) || 0;
    const pct = Math.min(100, (penalty / 20) * 100);
    const fill = document.getElementById('penaltyFill');
    document.getElementById('penaltyLabel').textContent = 'Most Recent Risk Penalty: ' + latest.penalty;
    fill.style.width = pct + '%';
    const color = colors(penalty);
    fill.style.background = color;
    fill.style.boxShadow = `0 0 8px ${color}`;

    // Last 3 unique penalty values excluding the most recent
    const seen = new Set();
    seen.add(parseFloat(latest.penalty));
    const prev3 = [];
    for (let i = 1; i < withPenalty.length; i++) {
        const p = parseFloat(withPenalty[i].penalty);
        if (!seen.has(p)) {
            seen.add(p);
            prev3.push(withPenalty[i]);
        }
        if (prev3.length === 3) break;
    }

    // Only enable hover if there's history
    const wrapper = document.querySelector('.penalty-history-wrapper');
    if (prev3.length > 0) {
        wrapper.classList.add('has-history');
    } else {
        wrapper.classList.remove('has-history');
    }

    [2, 3, 4].forEach((n, i) => {
        const log = prev3[i];
        const prevTrack = document.getElementById(`penaltyFill${n}`)?.closest('.penalty-track.prev');
        if (!prevTrack) return;
        if (log) {
            const p = parseFloat(log.penalty) || 0;
            prevTrack.style.display = 'block';
            const prevFill = document.getElementById(`penaltyFill${n}`);
            prevFill.style.width = Math.min(100, (p / 20) * 100) + '%';
            prevFill.style.background = colors(p);
            prevFill.style.boxShadow = `0 0 6px ${colors(p)}`;
        } else {
            prevTrack.style.display = 'none';
        }
    });
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
        const action = (log.action || '').toLowerCase();
        const badgeClass = action === 'buy' ? 'buy' : action === 'sell' ? 'sell' : 'rebalance';
        const qty = log.qty != null ? log.qty : '—';
        const price = log.price != null ? fmt$(log.price) : '—';
        const value = (log.qty && log.price) ? fmt$(log.qty * log.price) : '—';
        const penalty = log.penalty != null ? parseFloat(log.penalty).toFixed(2) : '—';
        const ts = log.timestamp ? log.timestamp.replace('T', ' ').slice(0, 19) : '—';

        return `<tr>
      <td class="timestamp">${ts}</td>  
      <td><span class="action-badge ${badgeClass}">${(log.action || '—').toUpperCase()}</span></td>
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

function renderCountdown() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();

    let nextDate;
    if (day < 15) {
        nextDate = new Date(Date.UTC(year, month, 15, 15, 0, 0));
    } else {
        nextDate = new Date(Date.UTC(year, month + 1, 1, 15, 0, 0));
    }

    const diff = nextDate - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    const localTime = nextDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
        timeZone: 'America/New_York'
    });

    const localDate = nextDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'America/New_York'
    });

    const el = document.getElementById('nextTradeCountdown');
    if (el) el.textContent = `NEXT TRADE ${days}d ${hours}h ${minutes}m · ${localDate} ${localTime}`;
}

async function refresh() {
    const [rows, logs, liveData, dailyRows] = await Promise.all([
        loadAccountHistory(),
        loadLogs(),
        loadWealthCSV(),
        loadDailyCSV()
    ]);

    const liveWealth = liveData.wealth;
    const liveTimestamp = liveData?.timestamp;

    renderStats(rows, liveWealth, liveTimestamp);
    renderWeights(rows);
    renderWeightsChart(rows);
    renderPenalty(logs);
    renderLogs(logs);
    updateLastUpdated();
    renderCountdown();

    if (activeTab === 'biweekly') {
        renderChart(rows);
        document.getElementById('chartPeriods').textContent = (rows?.length || 0) + ' periods';
    } else {
        renderDailyChart(dailyRows);
        document.getElementById('chartPeriods').textContent = (dailyRows?.length || 0) + ' days';
    }
}

refresh();
setInterval(refresh, 60000); // refresh every minute