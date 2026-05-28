(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  let currentResults = null;
  let allSavedQueries = {};
  let sortState = {};

  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    const data = await res.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));
    if (!res.ok && data.success !== false) {
      data.success = false;
      data.error = data.error || res.statusText;
    }
    return data;
  }

  async function loadTables() {
    const list = $('tablesList');
    list.innerHTML = '<div class="results-empty">Loading tables…</div>';
    const data = await api('/api/sql/tables');
    if (!data.success) {
      list.innerHTML = `<div class="results-error">${escapeHtml(data.error)}</div>`;
      return;
    }
    list.innerHTML = '';
    for (const name of data.tables) {
      const row = document.createElement('div');
      row.className = 'table-item-container';
      row.innerHTML = `
        <div class="table-item-row" data-table="${escapeAttr(name)}">
          <span>${escapeHtml(name)}</span>
          <button type="button" class="table-add-btn" title="Insert name">+</button>
        </div>
        <div class="table-columns-list" id="cols-${escapeAttr(name)}"></div>`;
      list.appendChild(row);

      row.querySelector('.table-item-row').addEventListener('click', e => {
        if (e.target.closest('.table-add-btn')) return;
        toggleColumns(name, row);
      });
      row.querySelector('.table-add-btn').addEventListener('click', e => {
        e.stopPropagation();
        insertAtCursor(name);
      });
    }
  }

  async function toggleColumns(name, container) {
    const colsEl = container.querySelector('.table-columns-list');
    const row = container.querySelector('.table-item-row');
    const open = colsEl.classList.toggle('open');
    row.classList.toggle('active', open);
    if (!open || colsEl.dataset.loaded) return;

    const data = await api(`/api/sql/tables/${encodeURIComponent(name)}/columns`);
    if (!data.success) {
      colsEl.innerHTML = `<div class="table-column-item">${escapeHtml(data.error)}</div>`;
      return;
    }
    colsEl.innerHTML = data.columns.map(c =>
      `<div class="table-column-item">${escapeHtml(c.name)} <span>${escapeHtml(c.type)}</span></div>`
    ).join('');
    colsEl.dataset.loaded = '1';
  }

  function insertAtCursor(text) {
    const ta = $('sqlQuery');
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.focus();
    const pos = start + text.length;
    ta.setSelectionRange(pos, pos);
  }

  async function executeQuery() {
    const query = $('sqlQuery').value.trim();
    if (!query) {
      alert('Please enter a SQL query');
      return;
    }
    const btn = $('executeBtn');
    const orig = btn.textContent;
    btn.textContent = 'Executing…';
    btn.disabled = true;

    const data = await api('/api/sql/execute', {
      method: 'POST',
      body: JSON.stringify({ query })
    });

    btn.textContent = orig;
    btn.disabled = false;

    if (data.success) displayResults(data);
    else displayError(data.error || 'Query execution failed');
  }

  function displayResults(data) {
    $('resultsSection').hidden = false;
    $('resultsStatus').textContent = 'Success';
    $('resultsStatus').className = 'badge badge-success';

    $('resultsCount').textContent = `${data.row_count ?? 0} rows`;
    $('resultsRuntime').textContent = `(${data.execution_time ?? 0}ms)`;

    const results = data.results || [];
    currentResults = results;
    sortState = {};

    if (!results.length) {
      $('resultsContent').innerHTML = '<div class="results-empty">No results returned</div>';
      $('downloadResultsBtn').hidden = true;
      return;
    }

    const columns = data.columns?.length ? data.columns : Object.keys(results[0]);
    renderTable(columns, results);
    $('downloadResultsBtn').hidden = false;
  }

  function renderTable(columns, rows) {
    let html = '<table class="results-table"><thead><tr>';
    columns.forEach(col => {
      html += `<th data-col="${escapeAttr(col)}">${escapeHtml(col)} ↕</th>`;
    });
    html += '</tr></thead><tbody>';
    for (const row of rows) {
      html += '<tr>';
      for (const col of columns) {
        html += `<td>${formatCell(row[col])}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    $('resultsContent').innerHTML = html;

    $('resultsContent').querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => sortByColumn(th.dataset.col, columns));
    });
  }

  function sortByColumn(col, columns) {
    if (!currentResults) return;
    const dir = sortState[col] === 'asc' ? 'desc' : 'asc';
    sortState = { [col]: dir };
    const sorted = [...currentResults].sort((a, b) => {
      const av = a[col], bv = b[col];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return dir === 'asc' ? cmp : -cmp;
    });
    renderTable(columns, sorted);
  }

  function formatCell(value) {
    if (value === null || value === undefined) return '<span class="null-val">NULL</span>';
    if (typeof value === 'object') {
      const s = JSON.stringify(value);
      return escapeHtml(s.length > 50 ? s.slice(0, 50) + '…' : s);
    }
    const s = String(value);
    return escapeHtml(s.length > 80 ? s.slice(0, 80) + '…' : s);
  }

  function displayError(message) {
    $('resultsSection').hidden = false;
    $('resultsStatus').textContent = 'Error';
    $('resultsStatus').className = 'badge badge-danger';
    $('resultsCount').textContent = '';
    $('resultsRuntime').textContent = '';
    $('resultsContent').innerHTML = `<div class="results-error">${escapeHtml(message)}</div>`;
    currentResults = null;
    $('downloadResultsBtn').hidden = true;
  }

  function downloadResults() {
    if (!currentResults?.length) {
      alert('No results to download');
      return;
    }
    const columns = Object.keys(currentResults[0]);
    let csv = columns.join(',') + '\n';
    for (const row of currentResults) {
      csv += columns.map(col => csvEscape(row[col])).join(',') + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sql_results_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value) {
    if (value == null) return '';
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function toggleSavedSidebar(show) {
    const sb = $('savedQueriesSidebar');
    sb.hidden = !show;
    if (show) loadSavedQueries();
  }

  async function loadSavedQueries() {
    const data = await api('/api/sql/saved');
    if (!data.success) {
      $('savedQueriesList').innerHTML = `<div class="results-error">${escapeHtml(data.error)}</div>`;
      return;
    }
    allSavedQueries = data.queries;
    renderSavedQueries(data.queries);
  }

  function renderSavedQueries(grouped, filter = '') {
    const list = $('savedQueriesList');
    const q = filter.trim().toLowerCase();
    list.innerHTML = '';
    const cats = Object.keys(grouped).sort();
    if (!cats.length) {
      list.innerHTML = '<div class="results-empty">No saved queries</div>';
      return;
    }
    for (const cat of cats) {
      const items = grouped[cat].filter(item => {
        if (!q) return true;
        return [item.name, item.description, item.query, item.category]
          .some(v => String(v || '').toLowerCase().includes(q));
      });
      if (!items.length) continue;

      const section = document.createElement('div');
      section.className = 'saved-category';
      section.innerHTML = `<div class="saved-category-head">${escapeHtml(cat)} (${items.length})</div>`;
      for (const item of items) {
        const div = document.createElement('div');
        div.className = 'saved-query-item';
        div.innerHTML = `
          <strong>${escapeHtml(item.name)}</strong>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
          <div class="saved-query-actions">
            <button type="button" data-action="run">Execute</button>
            <button type="button" data-action="load">Load</button>
            <button type="button" class="btn-delete" data-action="delete">Delete</button>
          </div>`;
        div.querySelector('[data-action="run"]').addEventListener('click', () => {
          $('sqlQuery').value = item.query;
          executeQuery();
        });
        div.querySelector('[data-action="load"]').addEventListener('click', () => {
          $('sqlQuery').value = item.query;
          toggleSavedSidebar(false);
        });
        div.querySelector('[data-action="delete"]').addEventListener('click', () => deleteSaved(item.id));
        section.appendChild(div);
      }
      list.appendChild(section);
    }
  }

  async function deleteSaved(id) {
    if (!confirm('Delete this saved query?')) return;
    const data = await api(`/api/sql/saved/${id}`, { method: 'DELETE' });
    if (data.success) {
      toast('Query deleted');
      loadSavedQueries();
    } else toast(data.error, 'error');
  }

  function openSaveModal() {
    const query = $('sqlQuery').value.trim();
    if (!query) {
      alert('Enter a query to save');
      return;
    }
    $('saveQueryPreview').value = query;
    $('saveQueryName').value = '';
    $('saveQueryDescription').value = '';
    $('saveModal').hidden = false;
    $('saveQueryName').focus();
  }

  async function submitSave() {
    const data = await api('/api/sql/saved', {
      method: 'POST',
      body: JSON.stringify({
        name: $('saveQueryName').value,
        description: $('saveQueryDescription').value,
        query: $('saveQueryPreview').value,
        category: $('saveQueryCategory').value
      })
    });
    if (data.success) {
      toast('Query saved');
      $('saveModal').hidden = true;
    } else toast(data.error, 'error');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  $('executeBtn').addEventListener('click', executeQuery);
  $('saveBtn').addEventListener('click', openSaveModal);
  $('showSavedQueriesBtn').addEventListener('click', () => toggleSavedSidebar(true));
  $('closeSavedQueries').addEventListener('click', () => toggleSavedSidebar(false));
  $('downloadResultsBtn').addEventListener('click', downloadResults);
  $('refreshTablesBtn').addEventListener('click', loadTables);
  $('saveModalCancel').addEventListener('click', () => { $('saveModal').hidden = true; });
  $('saveModalSubmit').addEventListener('click', submitSave);
  $('savedQueriesSearch').addEventListener('input', e => {
    renderSavedQueries(allSavedQueries, e.target.value);
  });

  $('sqlQuery').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeQuery();
    }
  });

  loadTables();
  $('sqlQuery').value = 'SELECT name, city, state, attendance\nFROM churches\nORDER BY attendance DESC\nLIMIT 20;';
})();
