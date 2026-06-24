// ===== NAVIGATION =====
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.section');
const topbarTitle = document.getElementById('topbarTitle');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');

navLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const target = link.dataset.section;

    navLinks.forEach(l => l.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));

    link.classList.add('active');
    document.getElementById('section-' + target).classList.add('active');
    topbarTitle.textContent = link.textContent.trim().replace(/◈\s*/, '');

    if (window.innerWidth < 900) sidebar.classList.remove('open');

    // lazy-init charts when needed
    initSectionCharts(target);
  });
});

menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

// close sidebar on outside click
document.addEventListener('click', e => {
  if (window.innerWidth < 900 && !sidebar.contains(e.target) && e.target !== menuToggle) {
    sidebar.classList.remove('open');
  }
});

// ===== CHART DEFAULTS =====
Chart.defaults.color = '#9090a8';
Chart.defaults.borderColor = '#2a2a38';
Chart.defaults.font.family = 'Inter';

const gold = '#c9a84c';
const goldFade = 'rgba(201,168,76,0.15)';
const green = '#22c55e';
const red = '#ef4444';
const blue = '#3b82f6';

const months12 = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
const months6  = ['Jan','Feb','Mar','Apr','May','Jun'];

// ===== DASHBOARD CHART =====
let dashChart;
function initDashboardChart() {
  if (dashChart) return;
  const ctx = document.getElementById('dashboardChart');
  if (!ctx) return;
  dashChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months12,
      datasets: [
        {
          label: 'Steel Sports Index',
          data: [100, 103, 108, 106, 112, 115, 118, 122, 119, 126, 130, 135],
          borderColor: gold,
          backgroundColor: goldFade,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: gold
        },
        {
          label: 'Vintage Index',
          data: [100, 102, 105, 109, 107, 111, 116, 120, 124, 128, 133, 140],
          borderColor: blue,
          backgroundColor: 'rgba(59,130,246,0.06)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: blue
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: '#1e1e28' },
          ticks: { callback: v => v + '%' }
        }
      }
    }
  });
}
initDashboardChart();

// ===== MARKET CHART =====
let marketChart;
const marketDatasets = {
  rolex: {
    label: 'Rolex Steel Sports — 12-Month Market Price',
    datasets: [
      { label: 'Sub 41 Black (126610LN)', data: [13200, 13500, 13800, 13600, 14000, 14200, 14100, 14400, 14300, 14600, 14800, 14500], color: gold },
      { label: 'GMT Batman (126710BLNR)', data: [16500, 16800, 17200, 17000, 17400, 17600, 17800, 18000, 17900, 18100, 18300, 18200], color: green },
      { label: 'Daytona (116500LN)', data: [28000, 28500, 29000, 29500, 30000, 30500, 31000, 31500, 31200, 32000, 32500, 32000], color: blue }
    ]
  },
  ap: {
    label: 'Audemars Piguet — 12-Month Market Price',
    datasets: [
      { label: 'Royal Oak 41mm Steel (15500ST)', data: [42000, 43000, 45000, 44000, 46000, 47000, 48000, 49000, 48500, 50000, 50500, 48000], color: gold },
      { label: 'ROO Diver (15710ST)', data: [28000, 28500, 29000, 29500, 30000, 30500, 31000, 31500, 30800, 32000, 32500, 31000], color: blue }
    ]
  },
  pp: {
    label: 'Patek Philippe — 12-Month Market Price',
    datasets: [
      { label: 'Nautilus 5711 (Steel)', data: [100000, 108000, 112000, 110000, 115000, 118000, 120000, 122000, 120000, 123000, 125000, 120000], color: gold },
      { label: 'Aquanaut 5167 (Steel)', data: [38000, 39000, 40500, 40000, 41000, 42000, 42500, 43000, 42000, 44000, 45000, 43000], color: green }
    ]
  },
  omega: {
    label: 'Omega — 12-Month Market Price',
    datasets: [
      { label: 'Speedmaster Moonwatch Pro', data: [6400, 6500, 6550, 6500, 6600, 6650, 6700, 6750, 6700, 6800, 6850, 6800], color: gold },
      { label: 'Seamaster 300M (B&W)', data: [5800, 5900, 6000, 5950, 6050, 6100, 6150, 6200, 6150, 6250, 6300, 6250], color: blue }
    ]
  }
};

function buildMarketChart(key) {
  const d = marketDatasets[key];
  document.getElementById('chartLabel').textContent = d.label;

  const datasets = d.datasets.map(ds => ({
    label: ds.label,
    data: ds.data,
    borderColor: ds.color,
    backgroundColor: ds.color.replace(')', ',0.06)').replace('rgb', 'rgba').replace('#c9a84c', 'rgba(201,168,76,0.1)').replace('#22c55e', 'rgba(34,197,94,0.06)').replace('#3b82f6', 'rgba(59,130,246,0.06)'),
    borderWidth: 2.5,
    fill: true,
    tension: 0.4,
    pointRadius: 3,
    pointBackgroundColor: ds.color
  }));

  if (marketChart) {
    marketChart.data.datasets = datasets;
    marketChart.update();
    return;
  }

  const ctx = document.getElementById('marketChart');
  if (!ctx) return;
  marketChart = new Chart(ctx, {
    type: 'line',
    data: { labels: months12, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: { label: ctx => ' ' + ctx.dataset.label + ': $' + ctx.raw.toLocaleString() }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#1e1e28' }, ticks: { callback: v => '$' + (v/1000).toFixed(0) + 'K' } }
      }
    }
  });
}

// market tabs
document.querySelectorAll('.tab[data-chart]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab[data-chart]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    buildMarketChart(tab.dataset.chart);
  });
});

// time filters (cosmetic toggle only)
document.querySelectorAll('.tf').forEach(tf => {
  tf.addEventListener('click', () => {
    document.querySelectorAll('.tf').forEach(t => t.classList.remove('active'));
    tf.classList.add('active');
  });
});

// ===== SPARKLINES =====
function makeSparkline(id, data, color) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array(data.length).fill(''),
      datasets: [{ data, borderColor: color, borderWidth: 2, fill: false, tension: 0.4, pointRadius: 0 }]
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: { duration: 600 }
    }
  });
}

// ===== CALCULATOR =====
let calcChart;
function calculateFlip() {
  const buy = parseFloat(document.getElementById('buyPrice').value) || 0;
  const sell = parseFloat(document.getElementById('sellPrice').value) || 0;
  const platFee = parseFloat(document.getElementById('platformFee').value) || 0;
  const payFee = parseFloat(document.getElementById('paymentFee').value) || 0;
  const ship = parseFloat(document.getElementById('shippingCost').value) || 0;
  const service = parseFloat(document.getElementById('serviceCost').value) || 0;
  const tax = parseFloat(document.getElementById('taxRate').value) || 0;

  const gross = sell - buy;
  const platCost = sell * (platFee / 100);
  const payCost = sell * (payFee / 100);
  const taxCost = sell * (tax / 100);
  const net = gross - platCost - payCost - ship - service - taxCost;
  const roi = buy > 0 ? (net / buy) * 100 : 0;
  const margin = sell > 0 ? (net / sell) * 100 : 0;

  const fmt = n => '$' + Math.round(n).toLocaleString();

  document.getElementById('r-buy').textContent = fmt(buy);
  document.getElementById('r-sell').textContent = fmt(sell);
  document.getElementById('r-gross').textContent = fmt(gross);
  document.getElementById('r-platform').textContent = '-' + fmt(platCost);
  document.getElementById('r-payment').textContent = '-' + fmt(payCost);
  document.getElementById('r-shipping').textContent = '-' + fmt(ship);
  document.getElementById('r-service').textContent = '-' + fmt(service);
  document.getElementById('r-tax').textContent = '-' + fmt(taxCost);
  document.getElementById('r-net').textContent = fmt(net);
  document.getElementById('r-roi').textContent = roi.toFixed(1) + '%';
  document.getElementById('r-margin').textContent = margin.toFixed(1) + '%';

  const verdict = document.getElementById('dealVerdict');
  if (net > 0 && roi > 20) {
    verdict.className = 'deal-verdict good';
    verdict.textContent = '✅ STRONG DEAL — Proceed with confidence';
  } else if (net > 0 && roi > 5) {
    verdict.className = 'deal-verdict ok';
    verdict.textContent = '⚠️ MARGINAL DEAL — Consider negotiating lower buy price';
  } else {
    verdict.className = 'deal-verdict bad';
    verdict.textContent = '❌ PASS — Fees eat the margin. Look for a better entry price';
  }

  // calc chart
  const ctx = document.getElementById('calcChart');
  if (!ctx) return;
  const data = {
    labels: ['Buy Price', 'Fees & Costs', 'Net Profit'],
    datasets: [{
      data: [buy, platCost + payCost + ship + service + taxCost, Math.max(net, 0)],
      backgroundColor: ['rgba(90,90,114,0.5)', 'rgba(239,68,68,0.5)', 'rgba(34,197,94,0.6)'],
      borderColor: ['#5a5a72', red, green],
      borderWidth: 1.5,
      borderRadius: 6
    }]
  };

  if (calcChart) {
    calcChart.data = data;
    calcChart.update();
  } else {
    calcChart = new Chart(ctx, {
      type: 'bar',
      data,
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' $' + Math.round(c.raw).toLocaleString() } } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#1e1e28' }, ticks: { callback: v => '$' + (v/1000).toFixed(0) + 'K' } }
        }
      }
    });
  }
}

// ===== STUDY ACCORDION =====
document.querySelectorAll('.module-title').forEach(title => {
  title.addEventListener('click', () => {
    const card = title.parentElement;
    card.classList.toggle('open');
  });
});

// ===== GLOSSARY SEARCH =====
function filterGlossary() {
  const q = document.getElementById('glossarySearch').value.toLowerCase();
  document.querySelectorAll('.gloss-item').forEach(item => {
    const t = item.textContent.toLowerCase();
    item.style.display = t.includes(q) ? '' : 'none';
  });
}

// ===== LAZY INIT =====
function initSectionCharts(section) {
  if (section === 'market') {
    setTimeout(() => buildMarketChart('rolex'), 50);
    setTimeout(() => {
      const sparkData = [
        { id: 'spark1', data: [12800, 13000, 13400, 13200, 13800, 14000, 14200, 14500], color: gold },
        { id: 'spark2', data: [16200, 16600, 17000, 16800, 17300, 17600, 17900, 18200], color: gold },
        { id: 'spark3', data: [27000, 28000, 29000, 29500, 30500, 31000, 31500, 32000], color: gold },
        { id: 'spark4', data: [11200, 11400, 11500, 11400, 11600, 11700, 11800, 11800], color: '#9090a8' },
        { id: 'spark5', data: [9500, 9600, 9700, 9750, 9800, 9820, 9810, 9800], color: red },
        { id: 'spark6', data: [41000, 41500, 42000, 42500, 42000, 42800, 43000, 42000], color: '#9090a8' }
      ];
      sparkData.forEach(s => makeSparkline(s.id, s.data, s.color));
    }, 100);
  }
  if (section === 'calculator') {
    setTimeout(calculateFlip, 50);
  }
}

// auto-run calculator on input change
['buyPrice', 'sellPrice', 'platformFee', 'paymentFee', 'shippingCost', 'serviceCost', 'taxRate'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', calculateFlip);
});

// ===== TICKER ANIMATION =====
const tickerInner = document.getElementById('tickerInner');
if (tickerInner) {
  // duplicate content for seamless loop
  tickerInner.innerHTML += tickerInner.innerHTML;

  let pos = 0;
  const halfW = () => tickerInner.scrollWidth / 2;

  function animateTicker() {
    pos -= 0.6;
    if (Math.abs(pos) >= halfW()) pos = 0;
    tickerInner.style.transform = `translateX(${pos}px)`;
    requestAnimationFrame(animateTicker);
  }
  requestAnimationFrame(animateTicker);
}
