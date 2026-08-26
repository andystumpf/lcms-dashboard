Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#6B7FA3';

const C = { blue:'#003087', gold:'#C7A84B', blue2:'#4A90D9', green:'#2E8B57', red:'#C0392B', orange:'#E67E22', purple:'#8E44AD', teal:'#16A085' };
const charts = {};
const yearlyArr = (k) => (activeYearly()[k] || []);

const NATIONAL_ONLY_YEARLY = [
  'totalGivingMillions', 'atHomeMillions', 'infantBaptisms', 'adultBaptisms',
  'confirmations', 'newMembers', 'removals'
];

function activeYearly() {
  const nat = LCMS.yearly || {};
  const years = nat.years || [];
  if (STATE.district === 'all') return nat;
  const nulls = years.map(() => null);
  const blocked = {};
  for (const k of NATIONAL_ONLY_YEARLY) blocked[k] = nulls;
  const d = LCMS.districtYearly && LCMS.districtYearly[STATE.district];
  if (!d) {
    return {
      ...nat,
      baptizedMembers: nulls,
      communingMembers: nulls,
      avgWeeklyAttendance: nulls,
      congregations: nulls,
      sampleSize: nulls,
      ...blocked
    };
  }
  return { ...nat, ...d, ...blocked };
}

function dColor(district) { return LCMS.districtColors[district] || '#888'; }

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function isFlatSeries(arr) {
  if (!arr?.length) return true;
  return arr.every(v => v === arr[0]);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function deactivateTabs(btn) {
  btn.closest('.chart-card, .top50-card').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ───────────────────────────────────────────────────────────────────────────
//  TOP 50 CHART
// ───────────────────────────────────────────────────────────────────────────

const TOP50_METRICS = {
  att:            { label:'Avg Weekly Attendance', field:'att',            fmt: v => v.toLocaleString(),           unit:'worshipers',   axisFmt: v => v.toLocaleString() },
  baptized:       { label:'Baptized Membership',   field:'baptized',       fmt: v => v.toLocaleString(),           unit:'members',      axisFmt: v => (v/1000).toFixed(0)+'K' },
  communing:      { label:'Communing Membership',  field:'communing',      fmt: v => v.toLocaleString(),           unit:'members',      axisFmt: v => (v/1000).toFixed(0)+'K' },
  giving:         { label:'Total Annual Giving',   field:'giving',         fmt: v => '$'+(v/1e6).toFixed(2)+'M',  unit:'',             axisFmt: v => '$'+(v/1e6).toFixed(1)+'M' },
  perMemberGiving:{ label:'Giving Per Member',     field:'perMemberGiving',fmt: v => '$'+v.toLocaleString(),      unit:'/ member',     axisFmt: v => '$'+v.toLocaleString() },
  conf:           { label:'Annual Confirmations',  field:'conf',           fmt: v => v.toLocaleString(),           unit:'confirmations',axisFmt: v => v.toLocaleString() },
};

const TOP50_TABLE_COLS = [
  { id: 'att',             field: 'att',             label: 'Attendance' },
  { id: 'baptized',        field: 'baptized',        label: 'Baptized' },
  { id: 'giving',          field: 'giving',          label: 'Total Giving' },
  { id: 'perMemberGiving', field: 'perMemberGiving', label: '$/Member' },
];

// Maps active Top 50 tab to a table column highlight (communing/conf rank outside these four).
const TOP50_SORT_COL = {
  att: 'att', baptized: 'baptized', giving: 'giving', perMemberGiving: 'perMemberGiving',
};

function top50CellFmt(field, v) {
  if (v == null) return '—';
  if (field === 'giving') return '$' + (v / 1e6).toFixed(2) + 'M';
  if (field === 'perMemberGiving') return '$' + Number(v).toLocaleString();
  return Number(v).toLocaleString();
}

let currentTop50Metric = 'att';
const top50TableSort = { col: 'att', dir: 'desc' };

function scopedChurchList() {
  if (STATE.district === 'all') return LCMS.churches;
  return LCMS.churches.filter(c => c.district === STATE.district);
}

function getTop50ByField(field, dir = 'desc') {
  const val = (c) => c[field];
  return [...scopedChurchList()]
    .filter(c => val(c) != null && val(c) > 0)
    .sort((a, b) => {
      const diff = dir === 'desc' ? val(b) - val(a) : val(a) - val(b);
      if (diff !== 0) return diff;
      return (a.cid ?? 0) - (b.cid ?? 0);
    })
    .slice(0, 50);
}

function getTop50Data(metricKey) {
  const { field } = TOP50_METRICS[metricKey];
  return getTop50ByField(field, 'desc');
}

function updateTop50Chart(metricKey, data) {
  const m = TOP50_METRICS[metricKey];
  charts.top50.data.labels = data.map(c => c.label);
  charts.top50.data.datasets[0].label           = m.label;
  charts.top50.data.datasets[0].data            = data.map(c => c[m.field]);
  charts.top50.data.datasets[0].backgroundColor = data.map(c => dColor(c.district) + 'DD');
  charts.top50.data.datasets[0].borderColor     = data.map(c => dColor(c.district));
  charts.top50.options = top50Opts(metricKey);
  charts.top50.update();
  const scope = STATE.district === 'all' ? 'LCMS Congregations' : `${STATE.district} Congregations`;
  document.getElementById('top50Title').textContent = `Top 50 ${scope} by ${m.label}`;
  buildDistrictLegend(data);
}

function syncTop50Tab(metricKey) {
  const btn = document.querySelector(`.top50-tabs .tab-btn[onclick*="'${metricKey}'"]`);
  if (btn) deactivateTabs(btn);
  currentTop50Metric = metricKey;
}

function buildTop50Chart() {
  const data = getTop50Data('att');
  const ctx = document.getElementById('top50Chart').getContext('2d');

  charts.top50 = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(c => c.label),
      datasets: [{
        label: 'Avg Weekly Attendance',
        data:  data.map(c => c.att),
        backgroundColor: data.map(c => dColor(c.district) + 'DD'),
        borderColor:     data.map(c => dColor(c.district)),
        borderWidth: 1,
        borderRadius: 3,
      }]
    },
    options: top50Opts('att')
  });

  buildDistrictLegend(data);
}

function top50Opts(metricKey) {
  const m = TOP50_METRICS[metricKey];
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: ctx => ctx[0].label,
          label: ctx => {
            const c = getTop50Data(metricKey)[ctx.dataIndex];
            return [
              `  ${m.label}: ${m.fmt(ctx.parsed.x)}${m.unit ? '  ' + m.unit : ''}`,
              `  District: ${c.district}`,
            ];
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: '#F0F2F5' },
        ticks: { callback: m.axisFmt }
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#1A2332' }
      }
    }
  };
}

window.showTop50 = function(metricKey, btn) {
  deactivateTabs(btn);
  currentTop50Metric = metricKey;
  const data = getTop50Data(metricKey);

  updateTop50Chart(metricKey, data);

  if (TOP50_SORT_COL[metricKey]) {
    top50TableSort.col = metricKey;
    top50TableSort.dir = 'desc';
    renderTop50Table(data, metricKey, 'desc');
  } else {
    renderTop50Table(data, null, 'desc');
  }
};

function buildDistrictLegend(data) {
  const seen = new Set();
  const items = [];
  data.forEach(c => {
    if (!seen.has(c.district)) { seen.add(c.district); items.push(c.district); }
  });
  const el = document.getElementById('districtLegend');
  el.innerHTML = items.map(d =>
    `<div class="legend-item"><span class="legend-dot" style="background:${dColor(d)}"></span>${escHtml(d)}</div>`
  ).join('');
}

function buildTop50TableHeader(sortCol, sortDir) {
  const thead = document.getElementById('top50TableHead');
  if (!thead) return;
  const fixed = '<th>#</th><th>Church</th><th>Location</th><th>District</th>';
  const cols = TOP50_TABLE_COLS.map(c => {
    const sorted = c.id === sortCol;
    const dirMark = sorted ? ` <span class="sort-mark">${sortDir === 'desc' ? 'high' : 'low'}</span>` : '';
    return `<th class="sortable${sorted ? ' col-sorted' : ''}" data-col="${c.id}" title="Sort by ${c.label}">${c.label}${dirMark}</th>`;
  }).join('');
  thead.innerHTML = fixed + cols;
}

function renderTop50Table(data, sortCol, sortDir) {
  buildTop50TableHeader(sortCol, sortDir);
  const tbody = document.getElementById('top50TableBody');
  tbody.innerHTML = '';
  data.forEach((c, i) => {
    const tr = document.createElement('tr');
    const metricCells = TOP50_TABLE_COLS.map(col => {
      const sorted = col.id === sortCol;
      const val = top50CellFmt(col.field, c[col.field]);
      return `<td class="${sorted ? 'col-sorted' : ''}">${sorted ? `<strong>${val}</strong>` : val}</td>`;
    }).join('');
    tr.innerHTML = `
      <td><span class="rank-badge" style="background:${dColor(c.district)}">${i + 1}</span></td>
      <td><strong>${escHtml(c.name)}</strong></td>
      <td>${escHtml(c.city)}, ${escHtml(c.st)}</td>
      <td><span class="district-tag" style="border-color:${dColor(c.district)};color:${dColor(c.district)}">${escHtml(c.district)}</span></td>
      ${metricCells}
    `;
    tbody.appendChild(tr);
  });
  const sub = document.getElementById('top50TableSubtitle');
  if (sub) {
    const col = TOP50_TABLE_COLS.find(c => c.id === sortCol);
    const label = col ? col.label.toLowerCase() : TOP50_METRICS[currentTop50Metric].label.toLowerCase();
    const dir = sortDir === 'desc' ? 'highest first' : 'lowest first';
    sub.textContent = col
      ? `Top 50 of ${LCMS.churches.length.toLocaleString()} congregations by ${label} (${dir})`
      : `Top 50 of ${LCMS.churches.length.toLocaleString()} congregations by ${label}`;
  }
}

window.sortTop50Table = function(colId) {
  if (top50TableSort.col === colId) {
    top50TableSort.dir = top50TableSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    top50TableSort.col = colId;
    top50TableSort.dir = 'desc';
  }
  const col = TOP50_TABLE_COLS.find(c => c.id === colId);
  const data = getTop50ByField(col.field, top50TableSort.dir);
  renderTop50Table(data, colId, top50TableSort.dir);
  if (TOP50_METRICS[colId]) {
    updateTop50Chart(colId, data);
    syncTop50Tab(colId);
  }
};

function initTop50TableSort() {
  const head = document.getElementById('top50TableHead');
  if (!head || head.dataset.sortBound) return;
  head.dataset.sortBound = '1';
  head.addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable');
    if (th?.dataset.col) sortTop50Table(th.dataset.col);
  });
}

// ── Membership ──────────────────────────────────────────────────────────────────────

function buildMembershipChart() {
  const ctx = document.getElementById('membershipChart').getContext('2d');
  charts.membership = new Chart(ctx, {
    type: 'line',
    data: {
      labels: LCMS.yearly.years,
      datasets: [
        { label:'Baptized Members', data:LCMS.yearly.baptizedMembers, borderColor:C.blue, backgroundColor:'rgba(0,48,135,0.08)', fill:true, tension:0.4, pointRadius:3, pointHoverRadius:6, borderWidth:2.5 },
        { label:'Communing Members', data:LCMS.yearly.communingMembers, borderColor:C.blue2, backgroundColor:'rgba(74,144,217,0.08)', fill:true, tension:0.4, pointRadius:3, pointHoverRadius:6, borderWidth:2.5 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ position:'top', labels:{ usePointStyle:true, padding:14, boxWidth:8 } },
        tooltip:{ callbacks:{ label:ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}` } }
      },
      scales:{
        x:{ grid:{ color:'#F0F2F5' } },
        y:{ grid:{ color:'#F0F2F5' }, ticks:{ callback:v => (v/1e6).toFixed(1)+'M' } }
      }
    }
  });
}

window.showMemberChart = function(type, btn) {
  deactivateTabs(btn);
  const ds = charts.membership.data.datasets;
  ds[0].hidden = type === 'communing';
  ds[1].hidden = type === 'baptized';
  charts.membership.update();
};

// ── Attendance ─────────────────────────────────────────────────────────────────────

function buildAttendanceChart() {
  const ctx = document.getElementById('attendanceChart').getContext('2d');
  charts.attendance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: yearlyArr('years'),
      datasets: [{ label:'Avg Weekly Attendance', data:yearlyArr('avgWeeklyAttendance'), borderColor:C.gold, backgroundColor:'rgba(199,168,75,0.12)', fill:true, tension:0.4, pointRadius:yearlyArr('years').map((y,i)=>y===2020?8:3), pointBackgroundColor:yearlyArr('years').map((y,i)=>y===2020?C.red:C.gold), pointHoverRadius:7, borderWidth:2.5 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx => ` ${ctx.parsed.y.toLocaleString()} worshipers`+(yearlyArr('years')[ctx.dataIndex]===2020?' (COVID-19)':'') } } },
      scales:{ x:{ grid:{ color:'#F0F2F5' } }, y:{ grid:{ color:'#F0F2F5' }, ticks:{ callback:v=>(v/1000).toFixed(0)+'K' }, beginAtZero:false } }
    }
  });
}

// ── Giving Trend ───────────────────────────────────────────────────────────────────

function buildGivingTrendChart() {
  const ctx = document.getElementById('givingTrendChart').getContext('2d');
  charts.givingTrend = new Chart(ctx, {
    type:'bar',
    data:{
      labels:yearlyArr('years'),
      datasets:[{
        label:'Total Contributions',
        data:yearlyArr('totalGivingMillions'),
        backgroundColor:C.blue+'CC',
        borderRadius:4
      }]
    },
    options:{ responsive:true, maintainAspectRatio:false, interaction:{ mode:'index',intersect:false }, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx=>` $${ctx.parsed.y}M` } } }, scales:{ x:{ grid:{ display:false } }, y:{ grid:{ color:'#F0F2F5' }, ticks:{ callback:v=>'$'+v+'M' } } } }
  });
}

// ── Giving Donut ───────────────────────────────────────────────────────────────────

function buildGivingDonutChart() {
  const ctx = document.getElementById('givingDonutChart').getContext('2d');
  const yr  = LCMS.yearly || {};
  const last = (arr) => Array.isArray(arr) && arr.length ? arr[arr.length - 1] : 0;
  const contrib = last(yr.totalGivingMillions);
  const atHome  = last(yr.atHomeMillions);
  const total   = contrib + atHome;

  charts.givingDonut = new Chart(ctx, {
    type:'doughnut',
    data:{
      labels:['Contributions','At-Home Expenses'],
      datasets:[{ data:[contrib, atHome], backgroundColor:[C.blue, C.gold], borderColor:'white', borderWidth:3, hoverOffset:8 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label: c => ` $${c.parsed}M  (${total ? ((c.parsed/total)*100).toFixed(1) : '0'}%)` } }
      }
    }
  });

  const yrs = yr.years || [];
  const lastYear = yrs.length ? yrs[yrs.length - 1] : null;
  const subEl = document.getElementById('givingDonutSubtitle');
  if (subEl) subEl.textContent = lastYear ? `Contributions vs. at-home · ${lastYear} · scraped sample` : 'No data';
  const legend = document.getElementById('givingDonutLegend');
  if (legend) {
    const fmt = (v) => v >= 1000 ? `$${(v/1000).toFixed(2)}B` : `$${v}M`;
    const pct = (v) => total ? `${((v/total)*100).toFixed(1)}%` : '—';
    legend.innerHTML = `
      <div class="donut-legend-item"><div style="width:12px;height:12px;border-radius:3px;background:#003087;flex-shrink:0;margin-top:3px"></div>
        <div><div style="font-size:13px;font-weight:600">Contributions</div><div style="font-size:11px;color:#6B7FA3">${fmt(contrib)} · ${pct(contrib)}</div></div></div>
      <div class="donut-legend-item"><div style="width:12px;height:12px;border-radius:3px;background:#C7A84B;flex-shrink:0;margin-top:3px"></div>
        <div><div style="font-size:13px;font-weight:600">At-Home Expenses</div><div style="font-size:11px;color:#6B7FA3">${fmt(atHome)} · ${pct(atHome)}</div></div></div>`;
  }
}

// ── District Chart ───────────────────────────────────────────────────────────────────

function buildDistrictChart() {
  const sorted = [...LCMS.districts].sort((a,b)=>b.churches-a.churches);
  const ctx = document.getElementById('districtChart').getContext('2d');
  charts.district = new Chart(ctx, {
    type:'bar',
    data:{ labels:sorted.map(d=>d.name), datasets:[{ label:'Congregations', data:sorted.map(d=>d.churches), backgroundColor:sorted.map(d=>dColor(d.name)+'CC'), borderRadius:3 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.x.toLocaleString()}` } } }, scales:{ x:{ grid:{ color:'#F0F2F5' }, ticks:{ callback:v=>v.toLocaleString() } }, y:{ grid:{ display:false }, ticks:{ font:{ size:11 } } } } }
  });
}

window.showDistrictMetric = function(metric, btn) {
  deactivateTabs(btn);
  const labels = { churches:'Congregations', baptized:'Baptized Members', attendance:'Avg Attendance', giving:'Giving ($M)' };
  const sorted = [...LCMS.districts].sort((a,b)=>(b[metric]??-Infinity)-(a[metric]??-Infinity));
  charts.district.data.labels = sorted.map(d=>d.name);
  charts.district.data.datasets[0].label = labels[metric];
  charts.district.data.datasets[0].data  = sorted.map(d=>d[metric]);
  charts.district.options.scales.x.ticks.callback = metric==='giving' ? v=>'$'+v+'M' : v=>v.toLocaleString();
  charts.district.update();
};

// ── Baptisms ────────────────────────────────────────────────────────────────────────

function buildBaptismChart() {
  const ctx = document.getElementById('baptismChart').getContext('2d');
  charts.baptism = new Chart(ctx, {
    type:'bar',
    data:{ labels:yearlyArr('years'), datasets:[
      { label:'Child Baptisms', data:yearlyArr('infantBaptisms'), backgroundColor:'rgba(0,48,135,0.75)', borderRadius:3 },
      { label:'Confirmations',  data:yearlyArr('confirmations'),  backgroundColor:'rgba(199,168,75,0.85)', borderRadius:3 }
    ] },
    options:{ responsive:true, maintainAspectRatio:false, interaction:{ mode:'index',intersect:false }, plugins:{ legend:{ position:'top', labels:{ usePointStyle:true,padding:14,boxWidth:8 } }, tooltip:{ callbacks:{ label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}` } } }, scales:{ x:{ grid:{ display:false } }, y:{ grid:{ color:'#F0F2F5' }, ticks:{ callback:v=>(v/1000).toFixed(0)+'K' } } } }
  });
}

// ── Size ─────────────────────────────────────────────────────────────────────────────

function buildSizeChart() {
  const ctx = document.getElementById('sizeChart').getContext('2d');
  const colors = [C.red,C.orange,C.gold,C.green,C.teal,C.blue,C.purple,'#2C3E50'];
  charts.size = new Chart(ctx, {
    type:'bar',
    data:{ labels:LCMS.churchSizes.map(d=>d.range), datasets:[{ label:'Congregations', data:LCMS.churchSizes.map(d=>d.count), backgroundColor:colors, borderRadius:5 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx=>[` Count: ${ctx.parsed.y.toLocaleString()}`,` Share: ${LCMS.churchSizes[ctx.dataIndex].pct}%`] } } }, scales:{ x:{ grid:{ display:false } }, y:{ grid:{ color:'#F0F2F5' }, title:{ display:true, text:'Congregations' } } } }
  });
}

// ── Per-Member Giving ───────────────────────────────────────────────────────────

function buildPerMemberGivingChart() {
  const perMember = yearlyArr('totalGivingMillions').map((g,i)=>{
    const b = yearlyArr('baptizedMembers')[i];
    return b ? Math.round((g*1e6)/b) : null;
  });
  const ctx = document.getElementById('perMemberGivingChart').getContext('2d');
  charts.perMemberGiving = new Chart(ctx, {
    type:'line',
    data:{ labels:yearlyArr('years'), datasets:[{ label:'Giving / Member', data:perMember, borderColor:C.green, backgroundColor:'rgba(46,139,87,0.1)', fill:true, tension:0.4, pointRadius:3, pointHoverRadius:6, borderWidth:2.5 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx=>` $${ctx.parsed.y.toLocaleString()} per member` } } }, scales:{ x:{ grid:{ color:'#F0F2F5' } }, y:{ grid:{ color:'#F0F2F5' }, ticks:{ callback:v=>'$'+v } } } }
  });
}

// ── Attendance Rate ───────────────────────────────────────────────────────────────

function buildAttendanceRateChart() {
  const rates = yearlyArr('avgWeeklyAttendance').map((a,i)=>{
    const com = yearlyArr('communingMembers')[i];
    return com ? +((a/com)*100).toFixed(1) : null;
  });
  const ctx = document.getElementById('attendanceRateChart').getContext('2d');
  charts.attendanceRate = new Chart(ctx, {
    type:'line',
    data:{ labels:yearlyArr('years'), datasets:[{ label:'Attendance Rate', data:rates, borderColor:C.purple, backgroundColor:'rgba(142,68,173,0.1)', fill:true, tension:0.4, pointRadius:3, pointHoverRadius:6, borderWidth:2.5 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx=>` ${ctx.parsed.y}% of communing members` } } }, scales:{ x:{ grid:{ color:'#F0F2F5' } }, y:{ grid:{ color:'#F0F2F5' }, ticks:{ callback:v=>v+'%' }, min:0, max:55 } } }
  });
}

// ── States ─────────────────────────────────────────────────────────────────────────────

function buildStateChart() {
  const sorted = [...LCMS.stateTop20].sort((a,b)=>b.churches-a.churches);
  const ctx = document.getElementById('stateChart').getContext('2d');
  charts.state = new Chart(ctx, {
    type:'bar',
    data:{ labels:sorted.map(d=>d.state), datasets:[{ label:'Congregations', data:sorted.map(d=>d.churches), backgroundColor:C.blue+'CC', borderRadius:3 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx=>[` Churches: ${sorted[ctx.dataIndex].churches.toLocaleString()}`,` Members: ${sorted[ctx.dataIndex].members.toLocaleString()}`] } } }, scales:{ x:{ grid:{ color:'#F0F2F5' } }, y:{ grid:{ display:false }, ticks:{ font:{ size:11 } } } } }
  });
}

// ── Member Flow (annual gains from PDFs) ──────────────────────────────────────────

function buildMemberFlowChart() {
  const ctx = document.getElementById('memberFlowChart').getContext('2d');
  charts.memberFlow = new Chart(ctx, {
    type:'bar',
    data:{ labels:yearlyArr('years'), datasets:[
      { label:'Baptisms & Confirmations', data:yearlyArr('newMembers'), backgroundColor:'rgba(46,139,87,0.75)', borderRadius:3 }
    ] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx=>` ${ctx.parsed.y.toLocaleString()} gains` } } }, scales:{ x:{ grid:{ display:false } }, y:{ grid:{ color:'#F0F2F5' }, ticks:{ callback:v=>(v/1000).toFixed(0)+'K' } } } }
  });
}

// ── District Table ────────────────────────────────────────────────────────────────

function buildDistrictTable() {
  const tbody = document.getElementById('districtTableBody');
  if (!tbody) return;
  const num = (v) => (v == null) ? '—' : v.toLocaleString();
  const money = (v) => (v == null) ? '—' : `$${v.toFixed(1)}M`;
  const sorted = [...LCMS.districts].sort((a, b) => (b.churches ?? -1) - (a.churches ?? -1));
  sorted.forEach((d, i) => {
    const pm = (d.giving && d.baptized) ? Math.round((d.giving * 1e6) / d.baptized) : null;
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><span class="rank-badge" style="background:${dColor(d.name)}">${i + 1}</span></td>` +
      `<td><strong>${escHtml(d.name)}</strong></td>` +
      `<td>${num(d.churches)}</td>` +
      `<td>${num(d.baptized)}</td>` +
      `<td>${num(d.communing)}</td>` +
      `<td>${num(d.attendance)}</td>` +
      `<td>${money(d.giving)}</td>` +
      `<td>${pm == null ? '—' : '$' + pm.toLocaleString()}</td>`;
    tbody.appendChild(tr);
  });
}

// ─── Unified filter state ────────────────────────────────────────────────────────
const STATE = { district: 'all', startYear: null, endYear: null };

function yearBounds() {
  const years = LCMS.yearly.years || [];
  if (!years.length) return { startIdx: 0, endIdx: -1 };
  let startIdx = 0;
  let endIdx = years.length - 1;
  if (STATE.startYear != null) {
    const i = years.indexOf(Number(STATE.startYear));
    if (i >= 0) startIdx = i;
  }
  if (STATE.endYear != null) {
    const i = years.indexOf(Number(STATE.endYear));
    if (i >= 0) endIdx = i;
  }
  if (startIdx > endIdx) { const t = startIdx; startIdx = endIdx; endIdx = t; }
  return { startIdx, endIdx };
}

function rangeStartIdx() { return yearBounds().startIdx; }

function scopedYears() {
  const { startIdx, endIdx } = yearBounds();
  return (LCMS.yearly.years || []).slice(startIdx, endIdx + 1);
}

function scopedSeries(f) {
  const { startIdx, endIdx } = yearBounds();
  return yearlyArr(f).slice(startIdx, endIdx + 1);
}

function scopedKpiSeries() {
  const y = activeYearly();
  const { startIdx, endIdx } = yearBounds();
  const cut = (arr) => (arr || []).slice(startIdx, endIdx + 1);
  const round = (arr) => cut(arr).map(v => v == null ? null : Math.round(v));
  return {
    cong: round(y.congregations),
    bap:  round(y.baptizedMembers),
    att:  round(y.avgWeeklyAttendance),
    giv:  cut(y.totalGivingMillions)
  };
}

const fmtMembers = v => v >= 1e6 ? (v/1e6).toFixed(3)+'M'
                       : v >= 1e4 ? (v/1e3).toFixed(0)+'K'
                       :            v.toLocaleString();
const fmtMoney   = v => v >= 1000 ? '$'+(v/1000).toFixed(2)+'B' : '$'+v.toFixed(0)+'M';
const pctChange  = (a, b) => ((b - a) / a) * 100;

// % change for period chart; null when start is zero or sample isn't comparable (giving).
function periodPctChange(arr, { minComparableRatio = 0 } = {}) {
  if (!arr?.length || arr.length < 2) return null;
  const start = arr[0], end = arr[arr.length - 1];
  if (start == null || end == null) return null;
  if (start === 0) return end === 0 ? 0 : null;
  if (minComparableRatio > 0 && end > 0 && start / end < minComparableRatio) return null;
  return +pctChange(start, end).toFixed(1);
}

// ─── KPI cards ──────────────────────────────────────────────────────────────────
function updateKpis() {
  const s = scopedKpiSeries();
  const yrs = scopedYears();
  const startYr = yrs[0];
  const last = s.cong.length - 1;
  const isDistrict = STATE.district !== 'all';

  const scoped = STATE.district === 'all'
    ? LCMS.churches
    : LCMS.churches.filter(c => c.district === STATE.district);
  const lSum = (f) => scoped.reduce((a, c) => a + (c[f] || 0), 0);
  const localKpis = {
    churches:   scoped.filter(c => c.att != null || c.baptized != null).length,
    baptized:   lSum('baptized') || null,
    attendance: lSum('att') || null,
    giving:     lSum('giving') ? +(lSum('giving') / 1e6).toFixed(1) : null,
  };
  const officialKpis = STATE.district === 'all'
    ? { churches: LCMS.summary.congregations, baptized: LCMS.summary.baptizedMembers, attendance: LCMS.summary.avgWeeklyAttendance, giving: LCMS.summary.totalGivingMillions }
    : LCMS.districts.find(x => x.name === STATE.district) || {};

  const pair = (id, lv, tv, fmt) => {
    const el = document.getElementById(id);
    if ((lv == null || lv === 0) && (tv == null || tv === 0)) { el.textContent = '—'; return; }
    if (lv && tv && lv !== tv) {
      const a = fmt(lv), b = fmt(tv);
      el.textContent = a === b ? a : `${a} of ${b}`;
    } else if (tv)                     el.textContent = fmt(tv);
    else                             el.textContent = fmt(lv);
  };

  // Always scraped-vs-official. The yearly congregations series is a constant
  // history-sample size (not synod size over time) and must not be the headline.
  pair('kpi-congregations', localKpis.churches,   officialKpis.churches,   v => v.toLocaleString());
  pair('kpi-baptized',      localKpis.baptized,   officialKpis.baptized,   fmtMembers);
  pair('kpi-attendance',    localKpis.attendance, officialKpis.attendance, fmtMembers);
  const gEl = document.getElementById('kpi-giving');
  if (localKpis.giving && officialKpis.giving && localKpis.giving !== officialKpis.giving) {
    const a = fmtMoney(localKpis.giving), b = fmtMoney(officialKpis.giving);
    gEl.textContent = a === b ? a : `${a} of ${b}`;
  } else if (officialKpis.giving) {
    gEl.textContent = fmtMoney(officialKpis.giving);
  } else {
    gEl.textContent = localKpis.giving ? fmtMoney(localKpis.giving) : '—';
  }

  const snap = LCMS.snapshot || {};
  const yearHint = snap.headlineYear ? ` · mostly ${snap.headlineYear}` : '';
  setText('kpi-source-cong', 'With stats vs official synod count');
  setText('kpi-source-bap', `Latest reported year per church${yearHint}`);
  setText('kpi-source-att', `Latest reported year per church${yearHint}`);
  setText('kpi-source-giv', snap.historyEnd
    ? `PDF contributions · not the ${snap.historyStart}–${snap.historyEnd} trend`
    : 'PDF contributions');

  const setChange = (id, arr, opts = {}) => {
    const el = document.getElementById(id);
    if (opts.flatMessage && isFlatSeries(arr)) {
      el.textContent = opts.flatMessage;
      el.className   = 'kpi-change';
      return;
    }
    if (isDistrict || arr.length < 2 || !arr[0]) {
      el.textContent = '—';
      el.className   = 'kpi-change';
      return;
    }
    const p = pctChange(arr[0], arr[last]);
    el.textContent = `${p >= 0 ? '+' : '-'}${Math.abs(p).toFixed(1)}% since ${startYr}`;
    el.className   = 'kpi-change ' + (p >= 0 ? 'up' : 'down');
  };
  setChange('kpi-change-cong', s.cong, { flatMessage: 'No synod-size time series' });
  setChange('kpi-change-bap',  s.bap);
  setChange('kpi-change-att',  s.att);
  setChange('kpi-change-giv',  s.giv);

  document.getElementById('kpi-label-cong').textContent =
    STATE.district === 'all' ? 'Active Congregations' : `${STATE.district} District`;
}

// ─── Context badges ─────────────────────────────────────────────────────────────
function updateContext() {
  const yrs = scopedYears();
  const scope = STATE.district === 'all' ? 'National' : STATE.district + ' District';
  const range = yrs.length ? `${yrs[0]}–${yrs[yrs.length-1]}` : '—';
  const extra = STATE.district === 'all'
    ? ''
    : ' · history from congregation reports; giving/baptisms not available by district';
  document.getElementById('insightsContext').textContent = `${scope} • ${range}${extra}`;
}

// ─── Insight Chart 1: Indexed Trajectory ────────────────────────────────────────
function buildIndexedTrendChart() {
  const ctx = document.getElementById('indexedTrendChart').getContext('2d');
  charts.indexedTrend = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [
      { label:'Baptized',      borderColor:C.blue,   backgroundColor:'rgba(0,48,135,0.05)',  data:[], tension:0.35, borderWidth:2.5, pointRadius:2.5, pointHoverRadius:6 },
      { label:'Attendance',    borderColor:C.purple, backgroundColor:'rgba(142,68,173,0.05)',data:[], tension:0.35, borderWidth:2.5, pointRadius:2.5, pointHoverRadius:6 },
      { label:'Giving',        borderColor:C.green,  backgroundColor:'rgba(46,139,87,0.05)', data:[], tension:0.35, borderWidth:2.5, pointRadius:2.5, pointHoverRadius:6 }
    ]},
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ position:'top', labels:{ usePointStyle:true, padding:14, boxWidth:8, font:{ size:11 } } },
        tooltip:{ callbacks:{ label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} (${ctx.parsed.y >= 100 ? '+' : ''}${(ctx.parsed.y-100).toFixed(1)})` } }
      },
      scales:{
        x:{ grid:{ color:'#F0F2F5' } },
        y:{ grid:{ color:'#F0F2F5' }, ticks:{ callback: v => v } }
      }
    }
  });
}

function refreshIndexedTrend() {
  const s = scopedKpiSeries();
  const idx = arr => (arr.length && arr[0]) ? arr.map(v => +((v / arr[0]) * 100).toFixed(1)) : arr.map(() => null);
  charts.indexedTrend.data.labels = scopedYears();
  charts.indexedTrend.data.datasets[0].data = idx(s.bap);
  charts.indexedTrend.data.datasets[1].data = idx(s.att);
  charts.indexedTrend.data.datasets[2].data = idx(s.giv);
  charts.indexedTrend.update();
}

// ─── Insight Chart 2: KPI Change Over Period ────────────────────────────────────
function buildKpiChangeChart() {
  const ctx = document.getElementById('kpiChangeChart').getContext('2d');
  charts.kpiChange = new Chart(ctx, {
    type: 'bar',
    data: { labels: ['Baptized','Attendance','Giving'], datasets: [{
      label:'% Change', data:[0,0,0,0],
      backgroundColor:[C.blue, C.blue2, C.purple, C.green],
      borderRadius:4, minBarLength:4
    }]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false },
        tooltip:{ callbacks:{ label(ctx) {
          const raw = charts.kpiChange._rawPct?.[ctx.dataIndex];
          if (raw == null) return ' N/A (incomplete sample at period start)';
          const shown = ctx.parsed.x;
          const clamped = Math.abs(raw - shown) > 0.05;
          return ` ${raw >= 0 ? '+' : ''}${raw.toFixed(1)}%` + (clamped ? ' (bar truncated to fit scale)' : '');
        } } }
      },
      scales:{
        x:{ grid:{ color:'#F0F2F5' }, ticks:{ callback: v => (v >= 0 ? '+' : '') + v + '%' } },
        y:{ grid:{ display:false }, ticks:{ font:{ size:11 } } }
      }
    }
  });
}

function refreshKpiChange() {
  const s = scopedKpiSeries();
  const raw = [
    periodPctChange(s.bap),
    periodPctChange(s.att),
    periodPctChange(s.giv, { minComparableRatio: 0.25 }),
  ];
  charts.kpiChange._rawPct = raw;

  const membership = raw.slice(0, 2).filter(v => v != null).map(v => Math.abs(v));
  const limit = membership.length ? Math.max(...membership, 1) * 1.25 : 15;
  charts.kpiChange.options.scales.x.min = -limit;
  charts.kpiChange.options.scales.x.max = limit;

  const display = raw.map((v, i) => {
    if (v == null) return null;
    if (i === 2 && Math.abs(v) > limit) return Math.sign(v) * limit;
    return v;
  });
  charts.kpiChange.data.datasets[0].data = display;
  charts.kpiChange.update();
}

// ─── Insight Chart 3: Members per Congregation ──────────────────────────────────
function buildMembersPerChurchChart() {
  const ctx = document.getElementById('membersPerChurchChart').getContext('2d');
  charts.membersPerChurch = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      label:'Members / Congregation', data:[],
      borderColor:C.gold, backgroundColor:'rgba(199,168,75,0.12)',
      fill:true, tension:0.4, borderWidth:2.5, pointRadius:3, pointHoverRadius:6
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false },
        tooltip:{ callbacks:{ label: ctx => ` ${ctx.parsed.y.toLocaleString()} members / church` } }
      },
      scales:{
        x:{ grid:{ color:'#F0F2F5' } },
        y:{ grid:{ color:'#F0F2F5' }, ticks:{ callback: v => v.toLocaleString() } }
      }
    }
  });
}

function refreshMembersPerChurch() {
  const s = scopedKpiSeries();
  charts.membersPerChurch.data.labels = scopedYears();
  charts.membersPerChurch.data.datasets[0].data = s.bap.map((b,i) => s.cong[i] ? Math.round(b / s.cong[i]) : null);
  charts.membersPerChurch.update();
}

// ─── Insight Chart 4: District Share / District Profile ─────────────────────────
function buildDistrictShareChart() {
  const ctx = document.getElementById('districtShareChart').getContext('2d');
  charts.districtShare = new Chart(ctx, {
    type:'bar',
    data:{ labels:[], datasets:[{ label:'', data:[], backgroundColor:[], borderRadius:3 }] },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false },
        tooltip:{ callbacks:{ label: ctx => ` ${ctx.parsed.x.toLocaleString()}` } }
      },
      scales:{
        x:{ grid:{ color:'#F0F2F5' }, ticks:{ callback: v => v.toLocaleString() } },
        y:{ grid:{ display:false }, ticks:{ font:{ size:11 } } }
      }
    }
  });
}

function refreshDistrictShare() {
  const title = document.getElementById('districtShareTitle');
  const sub   = document.getElementById('districtShareSubtitle');
  const ch    = charts.districtShare;

  if (STATE.district === 'all') {
    const sorted = [...LCMS.districts].sort((a,b)=>b.churches-a.churches);
    const top    = sorted.slice(0,10);
    const otherCount = sorted.slice(10).reduce((s,d)=>s+d.churches, 0);
    title.textContent = 'District Share of Congregations';
    sub.textContent   = 'Top 10 districts vs. all others';
    ch.data.labels = [...top.map(d=>d.name), 'All Others'];
    ch.data.datasets[0].label = 'Congregations';
    ch.data.datasets[0].data  = [...top.map(d=>d.churches), otherCount];
    ch.data.datasets[0].backgroundColor = [...top.map(d=>dColor(d.name)+'CC'), '#B0B8C9'];
    ch.options.scales.x.ticks.callback = v => v.toLocaleString();
  } else {
    const d = LCMS.districts.find(x=>x.name===STATE.district);
    if (!d) { ch.update(); return; }
    const avg = {
      churches:   Math.round(LCMS.summary.congregations    / LCMS.summary.districts),
      baptized:   Math.round(LCMS.summary.baptizedMembers  / LCMS.summary.districts),
      attendance: Math.round(LCMS.summary.avgWeeklyAttendance / LCMS.summary.districts),
      giving:     +(LCMS.summary.totalGivingMillions       / LCMS.summary.districts).toFixed(1)
    };
    title.textContent = `${d.name} vs. Synod Average`;
    sub.textContent   = `${d.name} District compared with the synod-wide average`;
    ch.data.labels = ['Congregations','Baptized','Attendance','Giving ($M)'];
    ch.data.datasets = [
      { label:d.name,           data:[d.churches, d.baptized, d.attendance, d.giving], backgroundColor:dColor(d.name)+'DD', borderRadius:3 },
      { label:'Synod Average',  data:[avg.churches, avg.baptized, avg.attendance, avg.giving], backgroundColor:'#B0B8C9', borderRadius:3 }
    ];
    ch.options.plugins.legend = { display:true, position:'top', labels:{ usePointStyle:true, padding:14, boxWidth:8, font:{ size:11 } } };
    ch.options.indexAxis = 'x';
    ch.options.scales.x = { grid:{ display:false }, ticks:{ font:{ size:11 } } };
    ch.options.scales.y = { grid:{ color:'#F0F2F5' }, ticks:{ callback: v => v.toLocaleString() } };
    ch.update();
    return;
  }
  ch.options.indexAxis = 'y';
  ch.options.plugins.legend = { display:false };
  ch.options.scales.x = { grid:{ color:'#F0F2F5' }, ticks:{ callback: v => v.toLocaleString() } };
  ch.options.scales.y = { grid:{ display:false }, ticks:{ font:{ size:11 } } };
  ch.update();
}

// ─── Trend chart period slicing (existing behavior, preserved) ───────────────────
function refreshTrendCharts() {
  const { startIdx, endIdx } = yearBounds();
  const yrs = yearlyArr('years').slice(startIdx, endIdx + 1);
  const slice = (arr) => (arr || []).slice(startIdx, endIdx + 1);
  const upd = (chart, sets) => { chart.data.labels = yrs; sets.forEach((d,i)=>{ chart.data.datasets[i].data = slice(d); }); chart.update(); };
  upd(charts.membership,        [yearlyArr('baptizedMembers'), yearlyArr('communingMembers')]);
  upd(charts.attendance,        [yearlyArr('avgWeeklyAttendance')]);
  upd(charts.givingTrend,       [yearlyArr('totalGivingMillions')]);
  upd(charts.baptism,           [yearlyArr('infantBaptisms'), yearlyArr('confirmations')]);
  const pm = yearlyArr('totalGivingMillions').map((g,i)=>{
    const b = yearlyArr('baptizedMembers')[i];
    return (g != null && b) ? Math.round((g*1e6)/b) : null;
  });
  upd(charts.perMemberGiving,   [pm]);
  const rates = yearlyArr('avgWeeklyAttendance').map((a,i)=>{
    const com = yearlyArr('communingMembers')[i];
    return (a != null && com) ? +((a/com)*100).toFixed(1) : null;
  });
  upd(charts.attendanceRate,    [rates]);
  const net = yearlyArr('newMembers');
  upd(charts.memberFlow,        [net]);
  refreshGivingDonut();
}

function refreshGivingDonut() {
  const ch = charts.givingDonut;
  if (!ch) return;
  const scoped = STATE.district === 'all'
    ? LCMS.churches
    : LCMS.churches.filter(c => c.district === STATE.district);
  const contrib = +(scoped.reduce((a, c) => a + (c.giving || 0), 0) / 1e6).toFixed(1);
  const atHome = +(scoped.reduce((a, c) => a + (c.atHomeExpenses || 0), 0) / 1e6).toFixed(1);
  const total = contrib + atHome;
  ch.data.datasets[0].data = [contrib, atHome];
  ch.options.plugins.tooltip.callbacks.label = c =>
    ` $${c.parsed}M  (${total ? ((c.parsed / total) * 100).toFixed(1) : '0'}%)`;
  ch.update();
  const subEl = document.getElementById('givingDonutSubtitle');
  const snap = LCMS.snapshot || {};
  const year = snap.headlineYear ? String(snap.headlineYear) : 'latest report year';
  const scope = STATE.district === 'all' ? 'National' : STATE.district;
  if (subEl) subEl.textContent = `${scope} · contributions vs at-home · ${year} PDF headlines (not the history window)`;
  const legend = document.getElementById('givingDonutLegend');
  if (legend) {
    const fmt = (v) => v >= 1000 ? `$${(v / 1000).toFixed(2)}B` : `$${v}M`;
    const pct = (v) => total ? `${((v / total) * 100).toFixed(1)}%` : '—';
    legend.innerHTML =
      `<div class="donut-legend-item"><div style="width:12px;height:12px;border-radius:3px;background:#003087;flex-shrink:0;margin-top:3px"></div>` +
      `<div><div style="font-size:13px;font-weight:600">Contributions</div><div style="font-size:11px;color:#6B7FA3">${fmt(contrib)} · ${pct(contrib)}</div></div></div>` +
      `<div class="donut-legend-item"><div style="width:12px;height:12px;border-radius:3px;background:#C7A84B;flex-shrink:0;margin-top:3px"></div>` +
      `<div><div style="font-size:13px;font-weight:600">At-Home Expenses</div><div style="font-size:11px;color:#6B7FA3">${fmt(atHome)} · ${pct(atHome)}</div></div></div>`;
  }
}

// ─── Main filter dispatcher ─────────────────────────────────────────────────────
function fillSnapshotLegend() {
  const el = document.getElementById('numbersLegend');
  if (!el) return;
  const snap = LCMS.snapshot;
  if (!snap) { el.hidden = true; return; }
  const hist = (snap.historyStart != null && snap.historyEnd != null)
    ? `${snap.historyStart}–${snap.historyEnd}`
    : 'the history window';
  const head = snap.headlineYear != null ? String(snap.headlineYear) : 'the latest reported year';
  const official = snap.officialCongregations != null
    ? snap.officialCongregations.toLocaleString()
    : '—';
  el.textContent = `Headlines are each church’s latest reported year (mostly ${head}). `
    + `Trend charts use ${hist} history for ${Number(snap.withHistory).toLocaleString()} congregations. `
    + `Locator lists ${Number(snap.churches).toLocaleString()} records; official synod count is ${official}. `
    + `Those figures are not interchangeable.`;
  el.hidden = false;
}

function refreshTop50() {
  if (!charts.top50) return;
  const data = getTop50Data(currentTop50Metric);
  updateTop50Chart(currentTop50Metric, data);
  const col = TOP50_SORT_COL[currentTop50Metric] || top50TableSort.col;
  renderTop50Table(data, col, top50TableSort.dir);
}

function applyFilters() {
  window.DSTATE = STATE;
  const safe = (fn, label) => { try { fn(); } catch (e) { console.warn(`[dashboard] skipped ${label}: ${e.message}`); } };
  safe(fillSnapshotLegend,        'fillSnapshotLegend');
  safe(updateContext,             'updateContext');
  safe(updateKpis,                'updateKpis');
  safe(refreshIndexedTrend,       'refreshIndexedTrend');
  safe(refreshKpiChange,          'refreshKpiChange');
  safe(refreshMembersPerChurch,   'refreshMembersPerChurch');
  safe(refreshDistrictShare,      'refreshDistrictShare');
  safe(refreshTrendCharts,        'refreshTrendCharts');
  safe(refreshTop50,              'refreshTop50');
  safe(() => { if (window.refreshStoryCharts) window.refreshStoryCharts(); }, 'refreshStoryCharts');
}

window.filterDistrict = function(v) { STATE.district = v; applyFilters(); };

function syncYearPresetOption() {
  const years = LCMS.yearly.years || [];
  const n = years.length;
  if (!n) return;
  const { startIdx, endIdx } = yearBounds();
  const preset = document.getElementById('yearPreset');
  if (!preset) return;
  if (startIdx === 0 && endIdx === n - 1) preset.value = 'all';
  else if (startIdx === Math.max(0, n - 5) && endIdx === n - 1) preset.value = '5';
  else if (startIdx === Math.max(0, n - 10) && endIdx === n - 1) preset.value = '10';
  else preset.value = 'custom';
}

window.updateYearWindow = function() {
  let start = +document.getElementById('yearStart').value;
  let end = +document.getElementById('yearEnd').value;
  if (start > end) {
    document.getElementById('yearStart').value = end;
    document.getElementById('yearEnd').value = start;
    [start, end] = [end, start];
  }
  STATE.startYear = start;
  STATE.endYear = end;
  syncYearPresetOption();
  applyFilters();
};

window.applyYearPreset = function(v) {
  if (v === 'custom') return;
  const years = LCMS.yearly.years || [];
  const n = years.length;
  if (!n) return;
  let startIdx = 0;
  if (v === '5')  startIdx = Math.max(0, n - 5);
  if (v === '10') startIdx = Math.max(0, n - 10);
  STATE.startYear = years[startIdx];
  STATE.endYear = years[n - 1];
  document.getElementById('yearStart').value = STATE.startYear;
  document.getElementById('yearEnd').value = STATE.endYear;
  applyFilters();
};

function populateYearFilters() {
  const years = LCMS.yearly.years || [];
  const startSel = document.getElementById('yearStart');
  const endSel = document.getElementById('yearEnd');
  if (!startSel || !endSel || !years.length) return;
  startSel.innerHTML = '';
  endSel.innerHTML = '';
  years.forEach(y => {
    startSel.appendChild(new Option(y, y));
    endSel.appendChild(new Option(y, y));
  });
  const n = years.length;
  const startIdx = Math.max(0, n - 10);
  STATE.startYear = years[startIdx];
  STATE.endYear = years[n - 1];
  startSel.value = STATE.startYear;
  endSel.value = STATE.endYear;
  syncYearPresetOption();
}

function populateDistrictFilter() {
  const sel = document.getElementById('districtFilter');
  [...LCMS.districts].sort((a,b)=>a.name.localeCompare(b.name)).forEach(d=>{
    const opt = document.createElement('option');
    opt.value=d.name; opt.textContent=d.name; sel.appendChild(opt);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.LCMS_READY) {
    try { await window.LCMS_READY; }
    catch { return; }   // loader displayed the empty state; do not build charts
  }

  // Defensive: any single builder failing on incomplete (partial) live data
  // must not blank the whole dashboard. Log the failure, render what we can.
  const safe = (fn, label) => { try { fn(); } catch (e) { console.warn(`[dashboard] skipped ${label}: ${e.message}`); } };

  safe(populateDistrictFilter,                              'populateDistrictFilter');
  safe(populateYearFilters,                                 'populateYearFilters');
  safe(buildTop50Chart,                                     'buildTop50Chart');
  safe(initTop50TableSort,                                  'initTop50TableSort');
  safe(() => renderTop50Table(getTop50Data('att'), 'att', 'desc'), 'renderTop50Table');
  safe(buildMembershipChart,                                'buildMembershipChart');
  safe(buildAttendanceChart,                                'buildAttendanceChart');
  safe(buildGivingTrendChart,                               'buildGivingTrendChart');
  safe(buildGivingDonutChart,                               'buildGivingDonutChart');
  safe(buildDistrictChart,                                  'buildDistrictChart');
  safe(buildBaptismChart,                                   'buildBaptismChart');
  safe(buildSizeChart,                                      'buildSizeChart');
  safe(buildPerMemberGivingChart,                           'buildPerMemberGivingChart');
  safe(buildAttendanceRateChart,                            'buildAttendanceRateChart');
  safe(buildStateChart,                                     'buildStateChart');
  safe(buildMemberFlowChart,                                'buildMemberFlowChart');
  safe(buildDistrictTable,                                  'buildDistrictTable');
  safe(buildIndexedTrendChart,                              'buildIndexedTrendChart');
  safe(buildKpiChangeChart,                                 'buildKpiChangeChart');
  safe(buildMembersPerChurchChart,                          'buildMembersPerChurchChart');
  safe(buildDistrictShareChart,                             'buildDistrictShareChart');
  safe(() => { if (window.initStoryCharts) window.initStoryCharts(); }, 'initStoryCharts');
  safe(applyFilters,                                        'applyFilters');
});
