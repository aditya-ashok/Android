// Live clock in the top bar
(function clock() {
  const el = document.getElementById('liveClock');
  function tick() {
    if (!el) return;
    const d = new Date();
    el.textContent = d.toLocaleString('en-IN', {
      weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata'
    }) + ' IST';
  }
  tick();
  setInterval(tick, 30000);
})();

// Animated counters in the hero
(function counters() {
  const els = document.querySelectorAll('[data-counter]');
  const animate = (el) => {
    const target = parseFloat(el.dataset.counter);
    const start = performance.now();
    const dur = 1400;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = target * eased;
      el.textContent = target >= 100 ? Math.round(val).toLocaleString('en-IN') : val.toFixed(0);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { animate(e.target); io.unobserve(e.target); }
    });
  }, { threshold: 0.4 });
  els.forEach((el) => io.observe(el));
})();

// Language toggle (cosmetic — swaps a few labels)
function setLang(lang) {
  document.documentElement.setAttribute('lang', lang);
  document.querySelectorAll('[data-en],[data-hi]').forEach((el) => {
    const v = el.getAttribute('data-' + lang);
    if (v) el.textContent = v;
  });
}
window.setLang = setLang;

// Chart.js defaults
if (window.Chart) {
  Chart.defaults.font.family = '"Plus Jakarta Sans", system-ui, sans-serif';
  Chart.defaults.color = '#475569';
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.elements.bar.borderRadius = 8;
}

// Mini sparkline in the hero card
(function spark() {
  const ctx = document.getElementById('miniSpark');
  if (!ctx || !window.Chart) return;
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['M','T','W','T','F','S','S'],
      datasets: [{
        data: [62, 68, 71, 74, 78, 82, 86],
        borderColor: '#ff9933',
        backgroundColor: (c) => {
          const { ctx, chartArea } = c.chart;
          if (!chartArea) return 'rgba(255,153,51,0.2)';
          const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, 'rgba(255,153,51,0.45)');
          g.addColorStop(1, 'rgba(255,153,51,0)');
          return g;
        },
        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: { x: { display: false }, y: { display: false } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
})();

// Budget by sector
(function budget() {
  const ctx = document.getElementById('budgetChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Roads', 'Health', 'Education', 'Water', 'Power', 'Agriculture', 'Skill', 'Sanitation'],
      datasets: [
        { label: 'Allocated', data: [62, 48, 36, 30, 22, 18, 14, 18], backgroundColor: '#0d2a6b' },
        { label: 'Spent',     data: [54, 32, 30, 18, 17, 14,  9, 12], backgroundColor: '#ff9933' }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#eef2f7' }, ticks: { callback: (v) => '₹' + v + 'Cr' } }
      },
      plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ₹' + c.parsed.y + ' Cr' } } }
    }
  });
})();

// Project status doughnut
(function status() {
  const ctx = document.getElementById('statusChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Completed','Ongoing','Tendered','Delayed'],
      datasets: [{
        data: [342, 98, 31, 15],
        backgroundColor: ['#10b981','#f59e0b','#0ea5e9','#ef4444'],
        borderColor: '#fff', borderWidth: 3, hoverOffset: 6
      }]
    },
    options: {
      maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: { display: false } }
    }
  });
})();

// Grievances over months
(function grievance() {
  const ctx = document.getElementById('grievanceChart');
  if (!ctx) return;
  const labels = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Received', data: [820, 940, 1100, 1240, 1180, 1090, 980, 1020, 1150, 1310, 1240, 1180],
          borderColor: '#0d2a6b', backgroundColor: 'rgba(13,42,107,0.08)', fill: true, tension: 0.35, borderWidth: 2, pointRadius: 2 },
        { label: 'Resolved', data: [780, 910, 1060, 1190, 1130, 1050, 940, 990, 1100, 1260, 1190, 1140],
          borderColor: '#138808', backgroundColor: 'rgba(19,136,8,0.10)', fill: true, tension: 0.35, borderWidth: 2, pointRadius: 2 }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: { x: { grid: { display: false } }, y: { grid: { color: '#eef2f7' } } },
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 11 } } } }
    }
  });
})();

// Category polar
(function category() {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels: ['Roads','Electricity','Water','Sanitation','Pension','Health'],
      datasets: [{
        data: [34, 22, 18, 12, 8, 6],
        backgroundColor: ['#ff9933','#0d2a6b','#0ea5e9','#10b981','#f43f5e','#a855f7'],
        borderColor: '#fff', borderWidth: 2
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: { r: { ticks: { display: false }, grid: { color: '#eef2f7' } } },
      plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
    }
  });
})();

// Ward-wise activity list
(function wards() {
  const host = document.getElementById('wardList');
  if (!host) return;
  const wards = [
    ['Jhanjharpur Town', 38], ['Phulparas', 32], ['Ghoghardiha', 28],
    ['Andharatharhi', 26], ['Khutauna', 24], ['Lakhnaur', 22],
    ['Lokhi', 19], ['Madhepur', 17], ['Babubarhi', 16],
    ['Laukahi', 14], ['Pandaul', 12], ['Basopatti', 11]
  ];
  const max = Math.max(...wards.map((w) => w[1]));
  host.innerHTML = wards.map(([name, n]) => `
    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="font-medium text-slate-700">${name}</span>
        <span class="text-slate-500">${n} projects</span>
      </div>
      <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full bg-gradient-to-r from-navy to-saffron" style="width:${(n / max) * 100}%"></div>
      </div>
    </div>
  `).join('');
})();
