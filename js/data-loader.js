// Loads LCMS data from /api/lcms only (SQLite via server/api.mjs).
// No JSON fallback — start the server: bash start.sh

(function () {
  const API_SOURCE = window.LCMS_API || '/api/lcms';

  function showEmptyState(reason) {
    const main = document.querySelector('main.main');
    if (main) for (const child of main.children) { if (child.id !== 'emptyState') child.hidden = true; }
    const es = document.getElementById('emptyState');
    if (es) {
      es.hidden = false;
      const detail = document.getElementById('emptyStateDetail');
      if (detail) detail.textContent = reason ? `Detail: ${reason}` : '';
    }
  }

  function mergeData(data) {
    if (!data || !data.summary || !Array.isArray(data.districts) || !data.districts.length) {
      throw new Error('LCMS payload is empty or malformed');
    }

    LCMS.summary   = { ...LCMS.summary, ...data.summary };
    LCMS.yearly    = { ...LCMS.yearly, ...(data.yearly || {}) };
    for (const k of Object.keys(LCMS.yearly)) {
      if (LCMS.yearly[k] == null) LCMS.yearly[k] = [];
    }
    LCMS.districts = data.districts;
    LCMS.churches  = (data.churches || []).map(c => ({
      ...c,
      label: `${c.name} • ${c.city}, ${c.st}`,
      perMemberGiving: c.perMemberGiving ?? (c.giving && c.baptized ? Math.round(c.giving / c.baptized) : null)
    }));
    LCMS.stateTop20  = data.stateTop20  || [];
    LCMS.churchSizes = data.churchSizes || [];
    const palette = ['#003087','#C7A84B','#2E8B57','#4A90D9','#8E44AD','#E67E22','#16A085','#C0392B','#2C3E50','#7F8C8D'];
    LCMS.districtColors = {};
    (data.districts || []).forEach((d, i) => { LCMS.districtColors[d.name] = palette[i % palette.length]; });

    console.info(`[lcms] loaded from SQLite: ${data.churches.length} churches, ${data.districts.length} districts`);
    return data;
  }

  window.LCMS_READY = fetch(API_SOURCE, { cache: 'no-store' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} for ${API_SOURCE}`)))
    .then(mergeData)
    .catch(err => {
      console.warn(`[lcms] API unavailable: ${err.message}`);
      showEmptyState(`${err.message}. Start the server: bash start.sh`);
      throw err;
    });
})();
