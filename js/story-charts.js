// Forty decade-story charts — membership, worship, giving, congregation health.
// Requires LCMS, Chart, dashboard DSTATE (set in applyFilters).

(function () {
  'use strict';

  const C = {
    blue: '#003087', gold: '#C7A84B', blue2: '#4A90D9', green: '#2E8B57',
    red: '#C0392B', orange: '#E67E22', purple: '#8E44AD', teal: '#16A085', gray: '#B0B8C9'
  };

  const charts = {};
  const ya = (k) => LCMS.yearly[k] || [];

  function state() {
    return window.DSTATE || { district: 'all', startYear: null, endYear: null };
  }

  function bounds() {
    const years = ya('years');
    if (!years.length) return { si: 0, ei: -1 };
    let si = 0, ei = years.length - 1;
    const st = state();
    if (st.startYear != null) { const i = years.indexOf(+st.startYear); if (i >= 0) si = i; }
    if (st.endYear != null) { const i = years.indexOf(+st.endYear); if (i >= 0) ei = i; }
    if (si > ei) { const t = si; si = ei; ei = t; }
    return { si, ei };
  }

  function yrs() {
    const { si, ei } = bounds();
    return ya('years').slice(si, ei + 1);
  }

  function slice(field) {
    const { si, ei } = bounds();
    return ya(field).slice(si, ei + 1);
  }

  function idx100(arr) {
    if (!arr.length || arr[0] == null || arr[0] === 0) return arr.map(() => null);
    const b = arr[0];
    return arr.map(v => v == null ? null : +((v / b) * 100).toFixed(1));
  }

  function yoyPct(arr) {
    return arr.map((v, i) => {
      if (i === 0 || v == null || arr[i - 1] == null || arr[i - 1] === 0) return null;
      return +(((v - arr[i - 1]) / arr[i - 1]) * 100).toFixed(1);
    });
  }

  function roll3(arr) {
    return arr.map((_, i) => {
      const w = arr.slice(Math.max(0, i - 2), i + 1).filter(v => v != null);
      return w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : null;
    });
  }

  function filteredChurches() {
    const st = state();
    if (st.district === 'all') return LCMS.churches;
    return LCMS.churches.filter(c => c.district === st.district);
  }

  function withHistory(minYears = 2) {
    return filteredChurches().filter(c => (c.history?.years?.length || 0) >= minYears);
  }

  function histVal(c, field, year) {
    const h = c.history;
    if (!h) return null;
    const i = h.years.indexOf(year);
    return i >= 0 ? h[field]?.[i] : null;
  }

  function medianByYear(field) {
    const years = yrs();
    return years.map(y => {
      const vals = withHistory(1)
        .map(c => histVal(c, field, y))
        .filter(v => v != null && v > 0)
        .sort((a, b) => a - b);
      if (!vals.length) return null;
      const m = Math.floor(vals.length / 2);
      return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
    });
  }

  function shareUnder(field, threshold, year) {
    const list = withHistory(1);
    let n = 0, d = 0;
    list.forEach(c => {
      const v = histVal(c, field, year);
      if (v != null) { d++; if (v < threshold) n++; }
    });
    return d ? +((n / d) * 100).toFixed(1) : null;
  }

  function shareOver(field, threshold, year) {
    const list = withHistory(1);
    let n = 0, d = 0;
    list.forEach(c => {
      const v = histVal(c, field, year);
      if (v != null) { d++; if (v >= threshold) n++; }
    });
    return d ? +((n / d) * 100).toFixed(1) : null;
  }

  function churchChangePct(field) {
    const years = yrs();
    if (years.length < 2) return null;
    const y0 = years[0], y1 = years[years.length - 1];
    return withHistory(2).map(c => {
      const a0 = histVal(c, field, y0), a1 = histVal(c, field, y1);
      if (a0 == null || a1 == null || a0 === 0) return null;
      return { c, pct: ((a1 - a0) / a0) * 100 };
    }).filter(Boolean);
  }

  function histBuckets(changes) {
    const labels = ['< −30%', '−30 to −15%', '−15 to −5%', '−5 to +5%', '+5 to +15%', '+15 to +30%', '> +30%'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    changes.forEach(({ pct }) => {
      if (pct < -30) counts[0]++;
      else if (pct < -15) counts[1]++;
      else if (pct < -5) counts[2]++;
      else if (pct <= 5) counts[3]++;
      else if (pct <= 15) counts[4]++;
      else if (pct <= 30) counts[5]++;
      else counts[6]++;
    });
    return { labels, counts };
  }

  function baseOpts(h = 220) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 10, boxWidth: 8, font: { size: 10 } } } },
      scales: {
        x: { grid: { color: '#F0F2F5' }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#F0F2F5' }, ticks: { font: { size: 10 } } }
      }
    };
  }

  function mkLine(id, datasets, extra = {}) {
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
      type: 'line',
      data: { labels: yrs(), datasets },
      options: { ...baseOpts(), ...extra }
    });
  }

  function mkBar(id, datasets, extra = {}) {
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
      type: 'bar',
      data: { labels: yrs(), datasets },
      options: { ...baseOpts(), ...extra }
    });
  }

  function mkHBar(id, labels, data, colors, extra = {}) {
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 3 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#F0F2F5' } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } }
        },
        ...extra
      }
    });
  }

  function mkScatter(id, points, extra = {}) {
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Congregations',
          data: points,
          backgroundColor: C.blue + '99',
          borderColor: C.blue,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Attendance % change', font: { size: 10 } }, grid: { color: '#F0F2F5' } },
          y: { title: { display: true, text: 'Baptized % change', font: { size: 10 } }, grid: { color: '#F0F2F5' } }
        },
        ...extra
      }
    });
  }

  function setCardText(id, title, sub) {
    const t = document.getElementById(id + '-title');
    const s = document.getElementById(id + '-sub');
    if (t && title != null) t.textContent = title;
    if (s && sub != null) s.textContent = sub;
  }

  function upd(id, labels, datasets) {
    const ch = charts[id];
    if (!ch) return;
    ch.data.labels = labels;
    datasets.forEach((d, i) => {
      if (!ch.data.datasets[i]) ch.data.datasets[i] = { ...d };
      else Object.assign(ch.data.datasets[i], d);
    });
    ch.data.datasets.length = datasets.length;
    ch.update();
  }

  const CATEGORIES = [
    {
      name: 'Membership & Retention',
      charts: [
        { id: 's01', title: 'Membership Gap', sub: 'Baptized minus communing members (national sample)',
          build: () => mkLine('s01', [{ label: 'Gap', data: [], borderColor: C.red, backgroundColor: 'rgba(192,57,43,0.08)', fill: true, tension: 0.35, borderWidth: 2 }]),
          refresh: () => {
            const b = slice('baptizedMembers'), c = slice('communingMembers');
            upd('s01', yrs(), [{ data: b.map((v, i) => (v != null && c[i] != null) ? v - c[i] : null) }]);
          }
        },
        { id: 's02', title: 'Net Member Flow', sub: 'New members minus removals each year',
          build: () => mkBar('s02', [
            { label: 'Net flow', data: [], backgroundColor: C.teal + 'CC', borderRadius: 3 }
          ]),
          refresh: () => {
            const n = slice('newMembers'), r = slice('removals');
            upd('s02', yrs(), [{ data: n.map((v, i) => (v != null && r[i] != null) ? v - r[i] : null) }]);
          }
        },
        { id: 's03', title: 'Gains vs Losses', sub: 'New members and removals (losses shown negative)',
          build: () => mkBar('s03', [
            { label: 'New members', data: [], backgroundColor: C.green + 'BB', borderRadius: 3 },
            { label: 'Removals', data: [], backgroundColor: C.red + 'BB', borderRadius: 3 }
          ]),
          refresh: () => upd('s03', yrs(), [
            { data: slice('newMembers') },
            { data: slice('removals').map(v => v == null ? null : -v) }
          ])
        },
        { id: 's04', title: 'Infant vs Adult Baptisms', sub: 'Child and adult baptism counts from PDF sample',
          build: () => mkBar('s04', [
            { label: 'Infant', data: [], backgroundColor: C.blue + 'CC', borderRadius: 3 },
            { label: 'Adult', data: [], backgroundColor: C.gold + 'CC', borderRadius: 3 }
          ]),
          refresh: () => upd('s04', yrs(), [
            { data: slice('infantBaptisms') }, { data: slice('adultBaptisms') }
          ])
        },
        { id: 's05', title: 'Confirmations', sub: 'Annual confirmations reported in congregation PDFs',
          build: () => mkLine('s05', [{ label: 'Confirmations', data: [], borderColor: C.gold, backgroundColor: 'rgba(199,168,75,0.12)', fill: true, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s05', yrs(), [{ data: slice('confirmations') }])
        },
        { id: 's06', title: 'Communing / Baptized Ratio', sub: 'Communing members as % of baptized',
          build: () => mkLine('s06', [{ label: '% communing', data: [], borderColor: C.purple, tension: 0.35, borderWidth: 2 }]),
          refresh: () => {
            const b = slice('baptizedMembers'), c = slice('communingMembers');
            upd('s06', yrs(), [{ data: b.map((v, i) => v ? +((c[i] / v) * 100).toFixed(1) : null) }]);
          }
        },
        { id: 's07', title: 'Confirmations per 1,000 Baptized', sub: 'Intensity of confirmation activity',
          build: () => mkLine('s07', [{ label: 'Per 1K', data: [], borderColor: C.orange, tension: 0.35, borderWidth: 2 }]),
          refresh: () => {
            const conf = slice('confirmations'), b = slice('baptizedMembers');
            upd('s07', yrs(), [{ data: conf.map((v, i) => b[i] ? +((v / b[i]) * 1000).toFixed(1) : null) }]);
          }
        },
        { id: 's10', title: 'Baptized Members Indexed', sub: 'Period start = 100',
          build: () => mkLine('s10', [{ label: 'Index', data: [], borderColor: C.blue, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s10', yrs(), [{ data: idx100(slice('baptizedMembers')) }])
        }
      ]
    },
    {
      name: 'Worship & Engagement',
      charts: [
        { id: 's11', title: 'YoY Attendance Change', sub: 'Year-over-year % change in avg weekly attendance',
          build: () => mkLine('s11', [{ label: '% change', data: [], borderColor: C.gold, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s11', yrs(), [{ data: yoyPct(slice('avgWeeklyAttendance')) }])
        },
        { id: 's12', title: 'YoY Baptized Change', sub: 'Year-over-year % change in baptized membership',
          build: () => mkLine('s12', [{ label: '% change', data: [], borderColor: C.blue2, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s12', yrs(), [{ data: yoyPct(slice('baptizedMembers')) }])
        },
        { id: 's13', title: 'Attendance Indexed', sub: 'Weekly worship attendance · period start = 100',
          build: () => mkLine('s13', [{ label: 'Index', data: [], borderColor: C.gold, backgroundColor: 'rgba(199,168,75,0.12)', fill: true, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s13', yrs(), [{ data: idx100(slice('avgWeeklyAttendance')) }])
        },
        { id: 's14', title: 'COVID Snapshot', sub: 'Attendance in 2019, 2020, and latest year in window',
          build: () => mkBar('s14', [{ label: 'Attendance', data: [], backgroundColor: [C.blue, C.red, C.green], borderRadius: 4 }], { plugins: { legend: { display: false } } }),
          refresh: () => {
            const allY = ya('years'), att = ya('avgWeeklyAttendance');
            const pick = (y) => { const i = allY.indexOf(y); return i >= 0 ? att[i] : null; };
            const latest = yrs().length ? yrs()[yrs().length - 1] : allY[allY.length - 1];
            const labels = ['2019', '2020', String(latest)];
            const data = [pick(2019), pick(2020), pick(latest)];
            upd('s14', labels, [{ data }]);
          }
        },
        { id: 's15', title: '3-Year Rolling Attendance', sub: 'Smoothed avg weekly attendance',
          build: () => mkLine('s15', [{ label: '3yr avg', data: [], borderColor: C.teal, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s15', yrs(), [{ data: roll3(slice('avgWeeklyAttendance')) }])
        },
        { id: 's16', title: 'Worship Attendance Rate', sub: 'Attendance as % of communing members',
          build: () => mkLine('s16', [{ label: '% attending', data: [], borderColor: C.purple, tension: 0.35, borderWidth: 2 }]),
          refresh: () => {
            const a = slice('avgWeeklyAttendance'), c = slice('communingMembers');
            upd('s16', yrs(), [{ data: a.map((v, i) => c[i] ? +((v / c[i]) * 100).toFixed(1) : null) }]);
          }
        },
        { id: 's17', title: 'Attendance per Baptized', sub: 'Avg worshipers per baptized member',
          build: () => mkLine('s17', [{ label: 'Att / baptized', data: [], borderColor: C.orange, tension: 0.35, borderWidth: 2 }]),
          refresh: () => {
            const a = slice('avgWeeklyAttendance'), b = slice('baptizedMembers');
            upd('s17', yrs(), [{ data: a.map((v, i) => b[i] ? +((v / b[i]) * 100).toFixed(1) : null) }]);
          }
        },
        { id: 's18', title: 'Median Church Attendance', sub: 'Median weekly attendance across congregations with history',
          build: () => mkLine('s18', [{ label: 'Median', data: [], borderColor: C.gold, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s18', yrs(), [{ data: medianByYear('attendance') }])
        },
        { id: 's19', title: 'Small Church Share', sub: '% of reporting churches under 50 weekly attendance',
          build: () => mkLine('s19', [{ label: '% under 50', data: [], borderColor: C.red, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s19', yrs(), [{ data: yrs().map(y => shareUnder('attendance', 50, y)) }])
        },
        { id: 's20', title: 'Large Church Share', sub: '% of reporting churches with 500+ weekly attendance',
          build: () => mkLine('s20', [{ label: '% 500+', data: [], borderColor: C.green, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s20', yrs(), [{ data: yrs().map(y => shareOver('attendance', 500, y)) }])
        }
      ]
    },
    {
      name: 'Giving & Stewardship',
      charts: [
        { id: 's21', title: 'Total Giving Trend', sub: 'Contributions from PDF sample (millions USD)',
          build: () => mkBar('s21', [{ label: '$M', data: [], backgroundColor: C.blue + 'CC', borderRadius: 3 }], { plugins: { legend: { display: false } } }),
          refresh: () => upd('s21', yrs(), [{ data: slice('totalGivingMillions') }])
        },
        { id: 's22', title: 'Giving vs At-Home Expenses', sub: 'Stacked view of contributions and at-home spending',
          build: () => mkBar('s22', [
            { label: 'Contributions', data: [], backgroundColor: C.blue + 'CC', borderRadius: 3 },
            { label: 'At-home', data: [], backgroundColor: C.gold + 'CC', borderRadius: 3 }
          ], { scales: { x: { stacked: true }, y: { stacked: true } } }),
          refresh: () => upd('s22', yrs(), [
            { data: slice('totalGivingMillions') }, { data: slice('atHomeMillions') }
          ])
        },
        { id: 's23', title: 'At-Home Expense Share', sub: 'At-home expenses as % of total contributions + expenses',
          build: () => mkLine('s23', [{ label: '% at-home', data: [], borderColor: C.gold, tension: 0.35, borderWidth: 2 }]),
          refresh: () => {
            const g = slice('totalGivingMillions'), h = slice('atHomeMillions');
            upd('s23', yrs(), [{ data: g.map((v, i) => (v + h[i]) ? +((h[i] / (v + h[i])) * 100).toFixed(1) : null) }]);
          }
        },
        { id: 's24', title: 'Giving YoY Change', sub: 'Year-over-year % change in total giving',
          build: () => mkLine('s24', [{ label: '% change', data: [], borderColor: C.green, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s24', yrs(), [{ data: yoyPct(slice('totalGivingMillions')) }])
        },
        { id: 's25', title: 'Giving Indexed', sub: 'Total contributions · period start = 100',
          build: () => mkLine('s25', [{ label: 'Index', data: [], borderColor: C.green, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s25', yrs(), [{ data: idx100(slice('totalGivingMillions')) }])
        },
        { id: 's26', title: 'Giving per Attendee', sub: 'Annual giving divided by weekly attendance',
          build: () => mkLine('s26', [{ label: '$ / attender', data: [], borderColor: C.teal, tension: 0.35, borderWidth: 2 }]),
          refresh: () => {
            const g = slice('totalGivingMillions'), a = slice('avgWeeklyAttendance');
            upd('s26', yrs(), [{ data: g.map((v, i) => a[i] ? Math.round((v * 1e6) / a[i]) : null) }]);
          }
        },
        { id: 's27', title: 'Giving per Baptized Member', sub: 'Annual giving divided by baptized membership',
          build: () => mkLine('s27', [{ label: '$ / member', data: [], borderColor: C.green, tension: 0.35, borderWidth: 2 }]),
          refresh: () => {
            const g = slice('totalGivingMillions'), b = slice('baptizedMembers');
            upd('s27', yrs(), [{ data: g.map((v, i) => b[i] ? Math.round((v * 1e6) / b[i]) : null) }]);
          }
        },
        { id: 's28', title: 'Decade Giving vs Attendance', sub: 'Both indexed to period start (=100)',
          build: () => mkLine('s28', [
            { label: 'Giving', data: [], borderColor: C.green, tension: 0.35, borderWidth: 2 },
            { label: 'Attendance', data: [], borderColor: C.gold, tension: 0.35, borderWidth: 2 }
          ]),
          refresh: () => upd('s28', yrs(), [
            { data: idx100(slice('totalGivingMillions')) },
            { data: idx100(slice('avgWeeklyAttendance')) }
          ])
        }
      ]
    },
    {
      name: 'Congregation Health & Geography',
      charts: [
        { id: 's29', title: 'Growing vs Declining', sub: 'Congregations with positive vs negative attendance change over period',
          build: () => mkBar('s29', [
            { label: 'Growing', data: [], backgroundColor: C.green + 'CC', borderRadius: 4 },
            { label: 'Declining', data: [], backgroundColor: C.red + 'CC', borderRadius: 4 }
          ], { plugins: { legend: { display: true } } }),
          refresh: () => {
            const ch = churchChangePct('attendance');
            const grow = ch.filter(x => x.pct > 5).length;
            const decline = ch.filter(x => x.pct < -5).length;
            upd('s29', ['Period change'], [{ data: [grow] }, { data: [decline] }]);
          }
        },
        { id: 's30', title: 'Attendance Change Distribution', sub: 'How congregations shifted over the selected window',
          build: () => mkBar('s30', [{ label: 'Churches', data: [], backgroundColor: C.blue + 'AA', borderRadius: 3 }], { plugins: { legend: { display: false } } }),
          refresh: () => {
            const { labels, counts } = histBuckets(churchChangePct('attendance'));
            upd('s30', labels, [{ data: counts }]);
          }
        },
        { id: 's31', title: 'Stagnant Congregations', sub: 'Churches within ±5% attendance change over period',
          build: () => mkBar('s31', [{ label: 'Count', data: [], backgroundColor: C.gray, borderRadius: 4 }], { plugins: { legend: { display: false } } }),
          refresh: () => {
            const n = churchChangePct('attendance').filter(x => Math.abs(x.pct) <= 5).length;
            upd('s31', ['±5% change'], [{ data: [n] }]);
          }
        },
        { id: 's32', title: 'Growth Trajectory Map', sub: 'Each dot: congregation baptized vs attendance % change',
          build: () => mkScatter('s32', []),
          refresh: () => {
            const att = churchChangePct('attendance');
            const bap = churchChangePct('baptized');
            const map = new Map(bap.map(x => [x.c.cid, x.pct]));
            const points = att.filter(x => map.has(x.c.cid)).slice(0, 400).map(x => ({
              x: +x.pct.toFixed(1), y: +map.get(x.c.cid).toFixed(1)
            }));
            charts.s32.data.datasets[0].data = points;
            charts.s32.update();
          }
        },
        { id: 's35', title: 'Period Start vs End', sub: 'Headline KPIs: first vs last year of window',
          build: () => mkBar('s35', [
            { label: 'Start', data: [], backgroundColor: C.blue + '99', borderRadius: 3 },
            { label: 'End', data: [], backgroundColor: C.green + '99', borderRadius: 3 }
          ]),
          refresh: () => {
            const labels = ['Baptized (M)', 'Attendance (K)', 'Giving ($M)'];
            const b = slice('baptizedMembers'), a = slice('avgWeeklyAttendance'), g = slice('totalGivingMillions');
            const n = b.length;
            if (!n) return;
            upd('s35', labels, [
              { data: [+(b[0] / 1e6).toFixed(2), +(a[0] / 1e3).toFixed(0), g[0]] },
              { data: [+(b[n - 1] / 1e6).toFixed(2), +(a[n - 1] / 1e3).toFixed(0), g[n - 1]] }
            ]);
          }
        },
        { id: 's36', title: 'Latest Year Pulse', sub: 'YoY % change for key metrics in the final year of window',
          build: () => mkHBar('s36', [], [], []),
          refresh: () => {
            const metrics = [
              { label: 'Baptized', s: slice('baptizedMembers') },
              { label: 'Communing', s: slice('communingMembers') },
              { label: 'Attendance', s: slice('avgWeeklyAttendance') },
              { label: 'Giving', s: slice('totalGivingMillions') },
              { label: 'Confirmations', s: slice('confirmations') }
            ];
            const labels = metrics.map(m => m.label);
            const data = metrics.map(m => {
              const y = yoyPct(m.s);
              return y.length ? y[y.length - 1] : null;
            });
            const colors = data.map(v => v == null ? C.gray : v >= 0 ? C.green + 'CC' : C.red + 'CC');
            const ch = charts.s36;
            ch.data.labels = labels;
            ch.data.datasets[0].data = data;
            ch.data.datasets[0].backgroundColor = colors;
            ch.update();
          }
        },
        { id: 's37', title: 'District Rank — Baptized', sub: 'Top 12 districts by baptized members (current)',
          build: () => mkHBar('s37', [], [], []),
          refresh: () => {
            const st = state();
            if (st.district !== 'all') {
              setCardText('s37', `${st.district} — Top Churches by Baptized`, 'Top 12 congregations in this district (current)');
              const sorted = [...filteredChurches()].filter(c => c.baptized).sort((a, b) => b.baptized - a.baptized).slice(0, 12);
              upd('s37', sorted.map(c => c.name.slice(0, 28)), [{ data: sorted.map(c => c.baptized), backgroundColor: sorted.map(c => (LCMS.districtColors?.[c.district] || C.blue) + 'CC') }]);
            } else {
              setCardText('s37', 'District Rank — Baptized', 'Top 12 districts by baptized members (current)');
              const sorted = [...LCMS.districts].sort((a, b) => (b.baptized || 0) - (a.baptized || 0)).slice(0, 12);
              upd('s37', sorted.map(d => d.name), [{ data: sorted.map(d => d.baptized), backgroundColor: sorted.map(d => (LCMS.districtColors?.[d.name] || C.blue) + 'CC') }]);
            }
          }
        },
        { id: 's38', title: 'District Rank — Attendance', sub: 'Top 12 by avg weekly attendance (current)',
          build: () => mkHBar('s38', [], [], []),
          refresh: () => {
            const st = state();
            if (st.district !== 'all') {
              setCardText('s38', `${st.district} — Top Churches by Attendance`, 'Top 12 congregations in this district (current)');
              const sorted = [...filteredChurches()].filter(c => c.att).sort((a, b) => b.att - a.att).slice(0, 12);
              upd('s38', sorted.map(c => c.name.slice(0, 28)), [{ data: sorted.map(c => c.att), backgroundColor: sorted.map(c => (LCMS.districtColors?.[c.district] || C.gold) + 'CC') }]);
            } else {
              setCardText('s38', 'District Rank — Attendance', 'Top 12 by avg weekly attendance (current)');
              const sorted = [...LCMS.districts].filter(d => d.attendance).sort((a, b) => b.attendance - a.attendance).slice(0, 12);
              upd('s38', sorted.map(d => d.name), [{ data: sorted.map(d => d.attendance), backgroundColor: sorted.map(d => (LCMS.districtColors?.[d.name] || C.gold) + 'CC') }]);
            }
          }
        },
        { id: 's39', title: 'Top States by Baptized', sub: 'Sum of current baptized membership by state',
          build: () => mkHBar('s39', [], [], []),
          refresh: () => {
            const bySt = {};
            filteredChurches().forEach(c => {
              if (!c.st || !c.baptized) return;
              bySt[c.st] = (bySt[c.st] || 0) + c.baptized;
            });
            const sorted = Object.entries(bySt).sort((a, b) => b[1] - a[1]).slice(0, 12);
            upd('s39', sorted.map(([s]) => s), [{ data: sorted.map(([, v]) => v), backgroundColor: C.blue + 'CC' }]);
          }
        },
        { id: 's40', title: 'Median Baptized by Year', sub: 'Typical congregation baptized membership over time',
          build: () => mkLine('s40', [{ label: 'Median baptized', data: [], borderColor: C.blue, tension: 0.35, borderWidth: 2 }]),
          refresh: () => upd('s40', yrs(), [{ data: medianByYear('baptized') }])
        }
      ]
    }
  ];

  function allDefs() {
    return CATEGORIES.flatMap(cat => cat.charts);
  }

  function mountStorySection() {
    const mount = document.getElementById('storyChartsMount');
    if (!mount || mount.dataset.mounted) return;
    mount.dataset.mounted = '1';
    let html = `
      <div class="section-title story-section-head">
        Ten-Year Story
        <span class="context-pill" id="storyContext">—</span>
      </div>
      <p class="story-section-lead">36 views for investigating membership, worship, giving, and congregation health over the selected period. Use the Period filter above — try <strong>Last 10 Years</strong>.</p>`;
    for (const cat of CATEGORIES) {
      html += `<div class="story-category-title">${cat.name}</div><div class="story-grid">`;
      for (const ch of cat.charts) {
        html += `
          <div class="chart-card story-chart-card">
            <h3 id="${ch.id}-title">${ch.title}</h3>
            <div class="chart-subtitle" id="${ch.id}-sub">${ch.sub}</div>
            <div class="chart-container story-chart-container"><canvas id="${ch.id}"></canvas></div>
          </div>`;
      }
      html += '</div>';
    }
    mount.innerHTML = html;
  }

  window.initStoryCharts = function () {
    mountStorySection();
    allDefs().forEach(def => {
      try { def.build(); } catch (e) { console.warn('[story]', def.id, e.message); }
    });
    window.refreshStoryCharts();
  };

  window.refreshStoryCharts = function () {
    const yrsList = yrs();
    const scope = state().district === 'all' ? 'National' : state().district;
    const range = yrsList.length ? `${yrsList[0]}–${yrsList[yrsList.length - 1]}` : '—';
    const el = document.getElementById('storyContext');
    if (el) el.textContent = `${scope} · ${range}`;
    allDefs().forEach(def => {
      try { def.refresh(); } catch (e) { console.warn('[story refresh]', def.id, e.message); }
    });
  };
})();
