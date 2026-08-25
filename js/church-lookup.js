// Individual church lookup: type-ahead search + detail panel with 10-year
// history chart and PDF-derived data. Reads from the same LCMS global the
// rest of the dashboard uses; gracefully no-ops if data isn't loaded yet.

(function () {
  const DEBOUNCE_MS = 90;

  let chart = null;
  let debounceTimer = null;

  const $ = (id) => document.getElementById(id);
  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const num = (n) => (n == null || Number.isNaN(n)) ? '—' : Number(n).toLocaleString();
  const money = (n) => (n == null) ? '—' : '$' + Number(n).toLocaleString();
  const pct = (n) => (n == null) ? '—' : Number(n).toFixed(1) + '%';

  function dColor(district) {
    return (LCMS.districtColors && LCMS.districtColors[district]) || '#003087';
  }

  function search(q) {
    return window.ChurchSearch ? ChurchSearch.search(q) : { hits: [], total: 0 };
  }

  function renderResults({ hits, total }) {
    const el = $('lookupResults');
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
    const truncated = total > hits.length;
    const header = `
      <div class="lookup-result-header">
        Showing <strong>${hits.length}</strong>${truncated ? ` of <strong>${total.toLocaleString()}</strong>` : ''} matches
        ${truncated ? ' &middot; <span class="muted">add a state or city to narrow</span>' : ''}
      </div>`;
    el.innerHTML = header + hits.map(c => `
      <button type="button" class="lookup-result" data-cid="${c.cid}">
        <span class="lookup-result-dot" style="background:${dColor(c.district)}"></span>
        <span class="lookup-result-main">
          <span class="lookup-result-name">${escHtml(c.name)}</span>
          <span class="lookup-result-sub">${escHtml(c.city)}, ${escHtml(c.st)} &middot; ${escHtml(c.district)}</span>
        </span>
        <span class="lookup-result-meta">
          ${c.att != null ? num(c.att) + ' avg' : '<span class="muted">no stats</span>'}
        </span>
      </button>
    `).join('');
    el.hidden = false;
  }

  function buildMiniChart(c) {
    const canvas = $('lookupTrendCanvas');
    if (!canvas) return;
    if (chart) { chart.destroy(); chart = null; }
    const h = c.history;
    if (!h?.years?.length) {
      canvas.parentElement.innerHTML = '<div class="lookup-empty" style="margin:0">No 10-year history available for this congregation.</div>';
      return;
    }
    chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: h.years,
        datasets: [
          { label: 'Baptized',  data: h.baptized,   borderColor: '#003087', backgroundColor: 'rgba(0,48,135,0.08)',   fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6 },
          { label: 'Confirmed', data: h.confirmed,  borderColor: '#4A90D9', backgroundColor: 'rgba(74,144,217,0.06)', fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6 },
          { label: 'Attendance',data: h.attendance, borderColor: '#C7A84B', backgroundColor: 'rgba(199,168,75,0.10)', fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, padding: 14, boxWidth: 8, font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${num(ctx.parsed.y)}` } }
        },
        scales: {
          x: { grid: { color: '#F0F2F5' } },
          y: { grid: { color: '#F0F2F5' }, ticks: { callback: v => v.toLocaleString() } }
        }
      }
    });
  }

  function similarRow(label, mine, sim, fmt = num) {
    if (mine == null && sim == null) return '';
    return `
      <tr>
        <td>${label}</td>
        <td><strong>${fmt(mine)}</strong></td>
        <td class="muted">${fmt(sim)}</td>
      </tr>`;
  }

  function renderDetail(c) {
    const detail = $('lookupDetail');
    const locatorUrl = `https://locator.lcms.org/church/C/${c.cid}`;
    const pdfUrl = (c.districtLookupId && c.uuid)
      ? `https://locator.lcms.org/api/stats/${c.districtLookupId}/${c.uuid}`
      : null;
    const historyEnd = c.history?.years?.length ? c.history.years[c.history.years.length - 1] : null;
    const headlineYear = c.lastStatYear || c.reportYear || historyEnd;
    const yearMismatch = headlineYear && historyEnd && Number(headlineYear) !== Number(historyEnd);
    const sim = (c.similar && typeof c.similar === 'object' && c.similar.peerCount) ? c.similar : null;
    const similarConf = sim
      ? (sim.confirmations ?? null)
      : null;

    const ministries = (c.ministries || []).reduce((acc, m) => {
      (acc[m.category] = acc[m.category] || []).push(m.type);
      return acc;
    }, {});

    detail.innerHTML = `
      <div class="lookup-detail-head">
        <div class="lookup-detail-title">
          <span class="legend-dot" style="background:${dColor(c.district)};width:14px;height:14px"></span>
          <div>
            <h2>${escHtml(c.name)}</h2>
            <p class="lookup-detail-sub">
              ${escHtml(c.address || `${c.city}, ${c.st}`)}${c.zip ? ' ' + escHtml(c.zip) : ''}
              &nbsp;&middot;&nbsp;
              <span class="district-tag" style="border-color:${dColor(c.district)};color:${dColor(c.district)}">${escHtml(c.district)} District</span>
              ${c.status ? `&nbsp;<span class="lookup-pill">${escHtml(c.status)}</span>` : ''}
              ${c.circuit ? `&nbsp;<span class="lookup-pill">Circuit ${escHtml(c.circuit.id)} &middot; ${escHtml(c.circuit.name)}</span>` : ''}
            </p>
          </div>
        </div>
        <div class="lookup-detail-actions">
          ${c.website ? `<a href="${/^https?:/i.test(c.website) ? c.website : 'https://' + c.website}" target="_blank" rel="noopener">Website</a>` : ''}
          <a href="${locatorUrl}" target="_blank" rel="noopener">LCMS Locator</a>
          ${pdfUrl ? `<a href="${pdfUrl}" target="_blank" rel="noopener">Stats PDF</a>` : ''}
          <a href="compare.html?cids=${c.cid}">Add to compare</a>
        </div>
      </div>

      <div class="lookup-kpis">
        <div class="lookup-kpi"><div class="lookup-kpi-label">Baptized${headlineYear ? ' (' + headlineYear + ')' : ''}</div><div class="lookup-kpi-value">${num(c.baptized)}</div></div>
        <div class="lookup-kpi"><div class="lookup-kpi-label">Communing</div><div class="lookup-kpi-value">${num(c.communing)}</div></div>
        <div class="lookup-kpi"><div class="lookup-kpi-label">Avg Weekly Attendance</div><div class="lookup-kpi-value">${num(c.att)}</div></div>
        <div class="lookup-kpi"><div class="lookup-kpi-label">Contributions${c.reportYear || headlineYear ? ' (' + (c.reportYear || headlineYear) + ')' : ''}</div><div class="lookup-kpi-value">${c.giving ? money(c.giving) : '—'}</div></div>
        <div class="lookup-kpi"><div class="lookup-kpi-label">At-Home Expenses</div><div class="lookup-kpi-value">${c.atHomeExpenses ? money(c.atHomeExpenses) : '—'}</div></div>
        <div class="lookup-kpi"><div class="lookup-kpi-label">$ / Conf. Member</div><div class="lookup-kpi-value">${c.contribsPerConfirmedMember ? money(c.contribsPerConfirmedMember) : (c.perMemberGiving ? money(c.perMemberGiving) : '—')}</div></div>
        <div class="lookup-kpi"><div class="lookup-kpi-label">Organized</div><div class="lookup-kpi-value">${escHtml(c.dateOrganized || '—')}</div></div>
      </div>
      ${yearMismatch ? `<p class="lookup-year-note">Headline stats are ${headlineYear}; the trend chart ends in ${historyEnd}.</p>` : ''}

      <div class="lookup-grid">
        <div class="lookup-panel">
          <h3>10-Year Trend ${historyEnd ? `<span class="pill-mini">through ${historyEnd}</span>` : ''}</h3>
          <div class="chart-container" style="height:240px"><canvas id="lookupTrendCanvas"></canvas></div>
        </div>

        ${sim ? `
        <div class="lookup-panel">
          <h3>This Congregation vs. Similar</h3>
          <p class="chart-subtitle">Average of ${sim.peerCount} churches with comparable communing membership (&plusmn;${Math.round((sim.band || 0.25) * 100)}%)</p>
          <table class="stats-table lookup-compare">
            <thead><tr><th>Metric</th><th>This</th><th>Similar</th></tr></thead>
            <tbody>
              ${similarRow('Weekly Attendance',    c.att,             sim.weeklyAttendance)}
              ${similarRow('Weekly Visitors',      c.weeklyVisitors,  sim.weeklyVisitors)}
              ${similarRow('% Visitors',           c.percentVisitors, sim.percentVisitors, pct)}
              ${similarRow('Child Baptisms',       c.baptisms,        sim.childBaptisms)}
              ${similarRow('Confirmations',        c.conf,            similarConf)}
            </tbody>
          </table>
        </div>` : `
        <div class="lookup-panel">
          <h3>This Congregation vs. Similar</h3>
          <p class="chart-subtitle">Not enough congregations with comparable communing membership to build a peer average.</p>
        </div>`}
      </div>

      ${(c.schools?.length || Object.keys(ministries).length || c.services?.length) ? `
        <div class="lookup-grid lookup-grid-3">
          ${c.schools?.length ? `
            <div class="lookup-panel">
              <h3>Schools <span class="pill-mini">${c.schools.length}</span></h3>
              <ul class="lookup-list">
                ${c.schools.map(s => {
                  const sch = s.school || s;
                  const name = sch.name || s.name || 'School';
                  const grades = sch.grades && typeof sch.grades === 'object'
                    ? Object.entries(sch.grades).filter(([, v]) => v).map(([k]) => k).join(', ')
                    : null;
                  return `<li><strong>${escHtml(name)}</strong>${s.type ? ` <span class="muted">&middot; ${escHtml(s.type)}</span>` : ''}${grades ? ` <span class="muted">&middot; ${escHtml(grades)}</span>` : ''}</li>`;
                }).join('')}
              </ul>
            </div>` : ''}

          ${Object.keys(ministries).length ? `
            <div class="lookup-panel">
              <h3>Ministries</h3>
              ${Object.entries(ministries).map(([cat, items]) => `
                <div class="lookup-ministry-cat">
                  <div class="lookup-ministry-label">${escHtml(cat)}</div>
                  <div class="lookup-ministry-tags">
                    ${items.map(t => `<span class="lookup-tag">${escHtml(t)}</span>`).join('')}
                  </div>
                </div>
              `).join('')}
            </div>` : ''}

          ${c.services?.length ? `
            <div class="lookup-panel">
              <h3>Service Times</h3>
              <ul class="lookup-list">
                ${c.services.slice(0, 8).map(s => `
                  <li>
                    <strong>${escHtml(s.type)}</strong>
                    <span class="muted">&middot; ${escHtml(s.day)} ${escHtml(s.time || '')}</span>
                  </li>`).join('')}
              </ul>
            </div>` : ''}
        </div>
      ` : ''}
    `;
    detail.hidden = false;
    buildMiniChart(c);
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectChurch(cid) {
    const c = LCMS.churches.find(x => String(x.cid) === String(cid));
    if (!c) return;
    $('lookupInput').value = `${c.name} — ${c.city}, ${c.st}`;
    $('lookupResults').hidden = true;
    $('lookupClear').hidden = false;
    renderDetail(c);
  }

  function clearLookup() {
    $('lookupInput').value = '';
    $('lookupResults').hidden = true;
    $('lookupDetail').hidden  = true;
    $('lookupClear').hidden   = true;
    if (chart) { chart.destroy(); chart = null; }
  }

  function wire() {
    const input = $('lookupInput');
    const results = $('lookupResults');
    if (!input || !results) {
      console.warn('[church-lookup] DOM elements missing; aborting wire()');
      return;
    }
    console.info('[church-lookup] wired; churches available:', LCMS?.churches?.length || 0);

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      $('lookupClear').hidden = !q;
      debounceTimer = setTimeout(() => renderResults(search(q)), DEBOUNCE_MS);
    });

    input.addEventListener('focus', () => {
      const q = input.value.trim();
      if (q.length >= 2) renderResults(search(q));
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') clearLookup();
      if (e.key === 'Enter') {
        const first = results.querySelector('.lookup-result');
        if (first) first.click();
      }
    });

    results.addEventListener('click', (e) => {
      const btn = e.target.closest('.lookup-result');
      if (btn) selectChurch(btn.dataset.cid);
    });

    $('lookupClear').addEventListener('click', clearLookup);

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.lookup-card')) results.hidden = true;
    });
  }

  // The script tag sits at the bottom of <body>, so DOMContentLoaded may have
  // already fired by the time we run. Wire immediately if the DOM is ready,
  // otherwise listen. Do NOT gate on LCMS_READY — the input should be usable
  // (with the "loading…" empty state) even if data hasn't arrived yet.
  function init() {
    wire();
    if (window.LCMS_READY) {
      window.LCMS_READY
        .then(() => {
          console.info('[church-lookup] data ready,', LCMS.churches?.length, 'churches');
          // If the user already typed something, re-run the search now.
          const input = $('lookupInput');
          if (input && input.value.trim()) {
            renderResults(search(input.value.trim()));
          }
        })
        .catch(err => console.warn('[church-lookup] LCMS data unavailable:', err?.message || err));
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
