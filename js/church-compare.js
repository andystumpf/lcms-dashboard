// Compare 2–10 congregations side-by-side: metrics table + overlaid trend chart.

(function () {
  const MIN_CHURCHES = 2;
  const MAX_CHURCHES = 10;
  const DEBOUNCE_MS = 90;
  const FALLBACK_COLORS = ['#003087','#C7A84B','#2E8B57','#4A90D9','#8E44AD','#E67E22','#16A085','#C0392B','#2C3E50','#7F8C8D'];

  const METRICS = [
    { key: 'baptized', label: 'Baptized', fmt: 'num' },
    { key: 'communing', label: 'Communing', fmt: 'num' },
    { key: 'att', label: 'Avg Weekly Attendance', fmt: 'num' },
    { key: 'giving', label: 'Total Giving', fmt: 'money' },
    { key: 'perMemberGiving', label: '$ / Member', fmt: 'money' },
    { key: 'conf', label: 'Confirmations', fmt: 'num' },
    { key: 'baptisms', label: 'Child Baptisms', fmt: 'num' },
    { key: 'atHomeExpenses', label: 'At-Home Expenses', fmt: 'money' },
    { key: 'contribsPerConfirmedMember', label: '$ / Conf. Member', fmt: 'money' },
    { key: 'district', label: 'District', fmt: 'text' },
    { key: 'dateOrganized', label: 'Organized', fmt: 'text' }
  ];

  const TREND_METRICS = {
    baptized:   { label: 'Baptized',   historyKey: 'baptized' },
    attendance: { label: 'Attendance', historyKey: 'attendance' },
    confirmed:  { label: 'Confirmed',  historyKey: 'confirmed' }
  };

  const RADAR_KEYS = [
    { key: 'att', label: 'Attendance' },
    { key: 'baptized', label: 'Baptized' },
    { key: 'communing', label: 'Communing' },
    { key: 'giving', label: 'Giving' },
    { key: 'perMemberGiving', label: '$/Member' }
  ];

  let selected = [];
  let trendMetric = 'baptized';
  const charts = {};
  let debounceTimer = null;

  const $ = (id) => document.getElementById(id);
  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const num = (n) => (n == null || Number.isNaN(n)) ? '—' : Number(n).toLocaleString();
  const money = (n) => (n == null) ? '—' : '$' + Number(n).toLocaleString();

  function resultPlaceLine(c, dupKeys) {
    const key = ChurchSearch.placeKey(c);
    const dup = key && dupKeys.has(key);
    const zip = (c.zip || '').trim();
    let loc = `${escHtml(c.city)}, ${escHtml(c.st)}`;
    if (dup && zip) loc += ` ${escHtml(zip)}`;
    const bits = [loc, escHtml(c.district)];
    if (dup) bits.push('#' + c.cid);
    return bits.join(' &middot; ');
  }

  function fmtVal(c, m) {
    const v = c[m.key];
    if (m.fmt === 'money') {
      if (m.key === 'contribsPerConfirmedMember' && v == null) {
        return c.perMemberGiving != null ? money(c.perMemberGiving) : '—';
      }
      return money(v);
    }
    if (m.fmt === 'text') return escHtml(v || '—');
    return num(v);
  }

  function dColor(district, index) {
    const dc = LCMS.districtColors && LCMS.districtColors[district];
    return dc || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }

  function syncUrl() {
    const cids = selected.map(c => c.cid).join(',');
    const url = new URL(window.location.href);
    if (cids) url.searchParams.set('cids', cids);
    else url.searchParams.delete('cids');
    history.replaceState(null, '', url);
  }

  function loadFromUrl() {
    const raw = new URLSearchParams(window.location.search).get('cids');
    if (!raw || !LCMS?.churches?.length) return;
    for (const cid of raw.split(',').map(s => s.trim()).filter(Boolean)) {
      if (selected.length >= MAX_CHURCHES) break;
      const c = LCMS.churches.find(x => String(x.cid) === String(cid));
      if (c && !selected.some(s => String(s.cid) === String(cid))) selected.push(c);
    }
  }

  function addChurch(cid) {
    if (selected.length >= MAX_CHURCHES) return;
    const c = LCMS.churches.find(x => String(x.cid) === String(cid));
    if (!c || selected.some(s => String(s.cid) === String(cid))) return;
    selected.push(c);
    $('compareInput').value = '';
    $('compareResults').hidden = true;
    render();
  }

  function removeChurch(cid) {
    selected = selected.filter(c => String(c.cid) !== String(cid));
    render();
  }

  function renderChips() {
    const el = $('compareChips');
    const count = selected.length;
    $('compareHint').textContent = count < MIN_CHURCHES
      ? `Select ${MIN_CHURCHES}–${MAX_CHURCHES} churches to compare (${count} selected).`
      : `${count} of ${MAX_CHURCHES} churches selected.`;

    el.innerHTML = selected.map((c, i) => `
      <span class="compare-chip" style="border-color:${dColor(c.district, i)}">
        <span class="compare-chip-dot" style="background:${dColor(c.district, i)}"></span>
        <span class="compare-chip-label">${escHtml(c.name)} &middot; ${escHtml(c.city)}, ${escHtml(c.st)}</span>
        <button type="button" class="compare-chip-remove" data-cid="${c.cid}" aria-label="Remove ${escHtml(c.name)}">&times;</button>
      </span>
    `).join('');

    const searchWrap = $('compareSearchWrap');
    if (searchWrap) searchWrap.hidden = count >= MAX_CHURCHES;
  }

  function renderMetricsTable() {
    const wrap = $('compareMetrics');
    if (selected.length < MIN_CHURCHES) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    const head = selected.map((c, i) => `
      <th class="col-church">
        <span class="compare-col-dot" style="background:${dColor(c.district, i)}"></span>
        ${escHtml(c.name)}
        <span class="compare-col-sub">${escHtml(c.city)}, ${escHtml(c.st)}</span>
      </th>
    `).join('');

    const body = METRICS.map(m => `
      <tr>
        <th class="compare-metric-label">${m.label}</th>
        ${selected.map(c => `<td>${fmtVal(c, m)}</td>`).join('')}
      </tr>
    `).join('');

    $('compareMetricsTable').innerHTML = `
      <thead><tr><th class="compare-metric-label">Metric</th>${head}</tr></thead>
      <tbody>${body}</tbody>
    `;
  }

  function unionYears(churches) {
    const set = new Set();
    for (const c of churches) {
      for (const y of c.history?.years || []) set.add(y);
    }
    return [...set].sort((a, b) => a - b);
  }

  function shortName(c) {
    const n = c.name || '';
    return n.length > 22 ? n.slice(0, 20) + '…' : n;
  }

  function destroyCharts() {
    for (const k of Object.keys(charts)) {
      charts[k]?.destroy();
      delete charts[k];
    }
  }

  function indexedSeries(c, historyKey, years) {
    const raw = historySeries(c, historyKey, years);
    const first = raw.find(v => v != null && v > 0);
    if (!first) return years.map(() => null);
    return raw.map(v => v == null ? null : +((v / first) * 100).toFixed(1));
  }

  function periodPctChange(c, historyKey) {
    const years = unionYears([c]);
    if (!years.length) return null;
    const series = historySeries(c, historyKey, years);
    const first = series.find(v => v != null);
    const last = [...series].reverse().find(v => v != null);
    if (first == null || last == null || first === 0) return null;
    return +(((last - first) / first) * 100).toFixed(1);
  }

  function worshipReachSeries(c, years) {
    const bapt = historySeries(c, 'baptized', years);
    const att = historySeries(c, 'attendance', years);
    return years.map((_, i) => (bapt[i] && att[i] != null) ? +((att[i] / bapt[i]) * 100).toFixed(1) : null);
  }

  function lineDatasets(years, historyKey, indexed = false) {
    return selected.map((c, i) => {
      const color = dColor(c.district, i);
      const data = indexed
        ? indexedSeries(c, historyKey, years)
        : historySeries(c, historyKey, years);
      return {
        label: c.name,
        data,
        borderColor: color,
        backgroundColor: color + '18',
        fill: false,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 6,
        spanGaps: true
      };
    });
  }

  function baseLineOpts(yLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, padding: 12, boxWidth: 8, font: { size: 10 } }
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${num(ctx.parsed.y)}` } }
      },
      scales: {
        x: { grid: { color: '#F0F2F5' }, title: { display: true, text: 'Year', font: { size: 11 } } },
        y: {
          grid: { color: '#F0F2F5' },
          ticks: { callback: v => v.toLocaleString() },
          title: { display: true, text: yLabel, font: { size: 11 } }
        }
      }
    };
  }

  function historySeries(c, historyKey, years) {
    const h = c.history;
    if (!h?.years?.length) return years.map(() => null);
    const map = new Map(h.years.map((y, i) => [y, h[historyKey]?.[i] ?? null]));
    return years.map(y => map.has(y) ? map.get(y) : null);
  }

  function showComparePanels(show) {
    $('compareTrend').hidden = !show;
    const extra = $('compareCharts');
    if (extra) extra.hidden = !show;
  }

  function renderTrendChart() {
    if (selected.length < MIN_CHURCHES) {
      showComparePanels(false);
      destroyCharts();
      return;
    }
    showComparePanels(true);

    const canvas = $('compareTrendCanvas');
    const emptyEl = $('compareTrendEmpty');
    if (!canvas) return;
    charts.trend?.destroy();

    const { historyKey, label } = TREND_METRICS[trendMetric];
    const years = unionYears(selected);
    if (!years.length) {
      canvas.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      destroyCharts();
      return;
    }
    canvas.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    charts.trend = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: years, datasets: lineDatasets(years, historyKey) },
      options: baseLineOpts(label)
    });

    document.querySelectorAll('.compare-trend-tabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.metric === trendMetric);
    });

    renderIndexedChart(years, historyKey);
    renderPctChangeChart(historyKey, label);
    renderRadarChart();
    renderWorshipReachChart(years);
    renderFinancialsChart();
  }

  function renderIndexedChart(years, historyKey) {
    const canvas = $('compareIndexedCanvas');
    if (!canvas || !years.length) return;
    charts.indexed?.destroy();
    charts.indexed = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: years, datasets: lineDatasets(years, historyKey, true) },
      options: {
        ...baseLineOpts('Index (first year = 100)'),
        plugins: {
          ...baseLineOpts('').plugins,
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}` } }
        }
      }
    });
  }

  function renderPctChangeChart(historyKey, label) {
    const canvas = $('comparePctChangeCanvas');
    if (!canvas) return;
    charts.pct?.destroy();

    const labels = selected.map(shortName);
    const data = selected.map(c => periodPctChange(c, historyKey));
    const colors = selected.map((c, i) => {
      const v = data[i];
      if (v == null) return dColor(c.district, i) + '55';
      return v >= 0 ? '#2E8B57CC' : '#C0392BCC';
    });

    charts.pct = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: `% change (${label})`, data, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.x;
                return v == null ? ' No history' : ` ${v >= 0 ? '+' : ''}${v}%`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: '#F0F2F5' }, ticks: { callback: v => (v >= 0 ? '+' : '') + v + '%' } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  function renderRadarChart() {
    const canvas = $('compareRadarCanvas');
    if (!canvas) return;
    charts.radar?.destroy();

    const maxFor = (key) => Math.max(...selected.map(c => Number(c[key]) || 0), 1);
    const maxes = Object.fromEntries(RADAR_KEYS.map(k => [k.key, maxFor(k.key)]));

    charts.radar = new Chart(canvas.getContext('2d'), {
      type: 'radar',
      data: {
        labels: RADAR_KEYS.map(k => k.label),
        datasets: selected.map((c, i) => ({
          label: c.name,
          data: RADAR_KEYS.map(k => +(((Number(c[k.key]) || 0) / maxes[k.key]) * 100).toFixed(1)),
          borderColor: dColor(c.district, i),
          backgroundColor: dColor(c.district, i) + '33',
          borderWidth: 2,
          pointRadius: 3
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, padding: 10, boxWidth: 8, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const m = METRICS.find(x => x.key === RADAR_KEYS[ctx.dataIndex].key);
                return ` ${ctx.dataset.label}: ${fmtVal(selected[ctx.datasetIndex], m)}`;
              }
            }
          }
        },
        scales: {
          r: { beginAtZero: true, max: 100, ticks: { stepSize: 25, font: { size: 9 } }, grid: { color: '#E0E4ED' } }
        }
      }
    });
  }

  function renderWorshipReachChart(years) {
    const canvas = $('compareWorshipReachCanvas');
    if (!canvas || !years.length) return;
    charts.worship?.destroy();

    charts.worship = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: years,
        datasets: selected.map((c, i) => {
          const color = dColor(c.district, i);
          return {
            label: c.name,
            data: worshipReachSeries(c, years),
            borderColor: color,
            backgroundColor: color + '18',
            fill: false,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 3,
            spanGaps: true
          };
        })
      },
      options: {
        ...baseLineOpts('Attendance % of baptized'),
        plugins: {
          ...baseLineOpts('').plugins,
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } }
        },
        scales: {
          x: { grid: { color: '#F0F2F5' } },
          y: { grid: { color: '#F0F2F5' }, ticks: { callback: v => v + '%' }, min: 0 }
        }
      }
    });
  }

  function renderFinancialsChart() {
    const canvas = $('compareFinancialsCanvas');
    if (!canvas) return;
    charts.financials?.destroy();

    const withFin = selected.filter(c => c.giving != null || c.atHomeExpenses != null);
    if (!withFin.length) return;

    charts.financials = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: withFin.map(shortName),
        datasets: [
          { label: 'Contributions', data: withFin.map(c => c.giving), backgroundColor: '#003087CC', borderRadius: 4 },
          { label: 'At-home expenses', data: withFin.map(c => c.atHomeExpenses), backgroundColor: '#C7A84BCC', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, padding: 12, boxWidth: 8, font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${money(ctx.parsed.y)}` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { grid: { color: '#F0F2F5' }, ticks: { callback: v => '$' + (v / 1e6).toFixed(1) + 'M' } }
        }
      }
    });
  }

  function updateYearNote() {
    const el = $('compareYearNote');
    if (!el) return;
    const note = selected.length >= MIN_CHURCHES && window.LCMSMath
      ? window.LCMSMath.compareYearMismatchNote(selected)
      : '';
    el.hidden = !note;
    el.textContent = note;
    const sub = $('compareTrendSubtitle');
    if (sub) {
      sub.textContent = note
        ? 'Overlaid history through the last history year — not the table’s latest reported year'
        : 'Overlaid history from congregation PDF stats';
    }
  }

  function render() {
    renderChips();
    renderMetricsTable();
    renderTrendChart();
    updateYearNote();
    syncUrl();
  }

  function renderResults({ hits, total }) {
    const el = $('compareResults');
    if (!LCMS?.churches?.length) {
      el.innerHTML = '<div class="lookup-empty">Loading church data&hellip; try again in a moment.</div>';
      el.hidden = false;
      return;
    }
    if (!hits.length) {
      el.innerHTML = '<div class="lookup-empty">No churches match. Try just the city or first word of the name.</div>';
      el.hidden = false;
      return;
    }
    const selectedIds = new Set(selected.map(c => String(c.cid)));
    const available = hits.filter(c => !selectedIds.has(String(c.cid)));
    if (!available.length) {
      el.innerHTML = '<div class="lookup-empty">All matching churches are already selected.</div>';
      el.hidden = false;
      return;
    }
    const truncated = total > hits.length;
    const dupKeys = ChurchSearch.duplicatePlaceKeys(LCMS.churches);
    const header = `
      <div class="lookup-result-header">
        Showing <strong>${available.length}</strong>${truncated ? ` of <strong>${total.toLocaleString()}</strong>` : ''} matches
        ${truncated ? ' &middot; <span class="muted">add a state or city to narrow</span>' : ''}
      </div>`;
    el.innerHTML = header + available.map(c => `
      <button type="button" class="lookup-result" data-cid="${c.cid}">
        <span class="lookup-result-dot" style="background:${dColor(c.district, 0)}"></span>
        <span class="lookup-result-main">
          <span class="lookup-result-name">${escHtml(c.name)}</span>
          <span class="lookup-result-sub">${resultPlaceLine(c, dupKeys)}</span>
        </span>
        <span class="lookup-result-meta">
          ${c.att != null ? num(c.att) + ' avg' : '<span class="muted">no stats</span>'}
        </span>
      </button>
    `).join('');
    el.hidden = false;
  }

  function setTrendMetric(metric) {
    if (!TREND_METRICS[metric]) return;
    trendMetric = metric;
    renderTrendChart();
  }

  function wire() {
    const input = $('compareInput');
    const results = $('compareResults');
    if (!input || !results) return;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      debounceTimer = setTimeout(() => {
        renderResults(ChurchSearch.search(q));
      }, DEBOUNCE_MS);
    });

    input.addEventListener('focus', () => {
      const q = input.value.trim();
      if (q.length >= 2) renderResults(ChurchSearch.search(q));
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        results.hidden = true;
      }
      if (e.key === 'Enter') {
        const first = results.querySelector('.lookup-result');
        if (first) first.click();
      }
    });

    results.addEventListener('click', (e) => {
      const btn = e.target.closest('.lookup-result');
      if (btn) addChurch(btn.dataset.cid);
    });

    $('compareChips').addEventListener('click', (e) => {
      const btn = e.target.closest('.compare-chip-remove');
      if (btn) removeChurch(btn.dataset.cid);
    });

    document.querySelector('.compare-trend-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn[data-metric]');
      if (btn) setTrendMetric(btn.dataset.metric);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.compare-search')) results.hidden = true;
    });
  }

  function init() {
    wire();
    const boot = () => {
      loadFromUrl();
      render();
    };
    if (window.LCMS_READY) {
      window.LCMS_READY.then(boot).catch(() => {});
    } else {
      boot();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.setCompareTrendMetric = setTrendMetric;
})();
