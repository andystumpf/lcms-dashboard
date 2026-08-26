// Pure re-implementation of the dashboard's filter/aggregation math so tests
// can verify behavior across every district + every year window without a
// browser. Each function mirrors the corresponding one in js/dashboard.js;
// any divergence should be treated as a test bug or a production bug.

export function yearBounds(years, startYear, endYear) {
  if (!years.length) return { startIdx: 0, endIdx: -1 };
  let startIdx = 0;
  let endIdx = years.length - 1;
  if (startYear != null) {
    const i = years.indexOf(Number(startYear));
    if (i >= 0) startIdx = i;
  }
  if (endYear != null) {
    const i = years.indexOf(Number(endYear));
    if (i >= 0) endIdx = i;
  }
  if (startIdx > endIdx) [startIdx, endIdx] = [endIdx, startIdx];
  return { startIdx, endIdx };
}

export function scopedYears(years, startYear, endYear) {
  const { startIdx, endIdx } = yearBounds(years, startYear, endYear);
  return years.slice(startIdx, endIdx + 1);
}

/** Scale a national yearly series by the selected district's share.
 *  Kept for tests/comparisons. Dashboard district views must use deriveDistrictYearly. */
export function scaleSeries(natSeries, district, districtField) {
  if (!district || !natSeries.length) return natSeries.slice();
  const natLast = natSeries[natSeries.length - 1];
  if (!natLast) return natSeries.slice();
  const ratio = (district[districtField] ?? 0) / natLast;
  return natSeries.map(v => v * ratio);
}

export const NATIONAL_ONLY_YEARLY_FIELDS = [
  'totalGivingMillions', 'atHomeMillions', 'infantBaptisms', 'adultBaptisms',
  'confirmations', 'newMembers', 'removals'
];

/** Sum church_yearly history into one series per district. */
export function deriveDistrictYearly(churches, years) {
  const list = years || [];
  const yearIndex = new Map(list.map((y, i) => [Number(y), i]));
  const n = list.length;
  const byDistrict = new Map();

  function bucket(name) {
    if (!byDistrict.has(name)) {
      byDistrict.set(name, {
        baptizedMembers: Array(n).fill(0),
        communingMembers: Array(n).fill(0),
        avgWeeklyAttendance: Array(n).fill(0),
        congregations: Array(n).fill(0),
        bapN: Array(n).fill(0),
        confN: Array(n).fill(0),
        attN: Array(n).fill(0)
      });
    }
    return byDistrict.get(name);
  }

  for (const c of churches) {
    const name = c.district;
    const h = c.history;
    if (!name || !h?.years?.length) continue;
    const b = bucket(name);
    for (let i = 0; i < h.years.length; i++) {
      const yi = yearIndex.get(Number(h.years[i]));
      if (yi == null) continue;
      let counted = false;
      if (h.baptized?.[i] != null) {
        b.baptizedMembers[yi] += h.baptized[i];
        b.bapN[yi]++;
        counted = true;
      }
      if (h.confirmed?.[i] != null) {
        b.communingMembers[yi] += h.confirmed[i];
        b.confN[yi]++;
        counted = true;
      }
      if (h.attendance?.[i] != null) {
        b.avgWeeklyAttendance[yi] += h.attendance[i];
        b.attN[yi]++;
        counted = true;
      }
      if (counted) b.congregations[yi]++;
    }
  }

  const out = {};
  for (const [name, b] of byDistrict) {
    out[name] = {
      years: list.slice(),
      baptizedMembers: b.baptizedMembers.map((v, i) => b.bapN[i] ? v : null),
      communingMembers: b.communingMembers.map((v, i) => b.confN[i] ? v : null),
      avgWeeklyAttendance: b.avgWeeklyAttendance.map((v, i) => b.attN[i] ? v : null),
      congregations: b.congregations,
      sampleSize: b.congregations.slice()
    };
  }
  return out;
}

function nullSeries(years) {
  return (years || []).map(() => null);
}

/** National yearly, or district history overlay with national-only fields nulled. */
export function yearlyForScope(LCMS, district = 'all') {
  const nat = LCMS.yearly || {};
  const years = nat.years || [];
  if (!district || district === 'all') return nat;
  const blocked = Object.fromEntries(NATIONAL_ONLY_YEARLY_FIELDS.map(k => [k, nullSeries(years)]));
  const d = LCMS.districtYearly?.[district];
  if (!d) {
    return {
      ...nat,
      baptizedMembers: nullSeries(years),
      communingMembers: nullSeries(years),
      avgWeeklyAttendance: nullSeries(years),
      congregations: nullSeries(years),
      sampleSize: nullSeries(years),
      ...blocked
    };
  }
  return { ...nat, ...d, ...blocked };
}

export function scopedKpiSeries(LCMS, { district = 'all', startYear, endYear }) {
  const y = yearlyForScope(LCMS, district);
  const years = y.years || [];
  const { startIdx, endIdx } = yearBounds(years, startYear, endYear);
  const cut = (arr) => (arr || []).slice(startIdx, endIdx + 1);
  const round = (arr) => cut(arr).map(v => v == null ? null : Math.round(v));
  return {
    cong: round(y.congregations),
    bap:  round(y.baptizedMembers),
    att:  round(y.avgWeeklyAttendance),
    giv:  cut(y.totalGivingMillions)
  };
}

export function pctChange(a, b) { return ((b - a) / a) * 100; }

export function periodPctChange(arr, { minComparableRatio = 0 } = {}) {
  if (!arr?.length || arr.length < 2) return null;
  const start = arr[0], end = arr[arr.length - 1];
  if (start == null || end == null) return null;
  if (start === 0) return end === 0 ? 0 : null;
  if (minComparableRatio > 0 && end > 0 && start / end < minComparableRatio) return null;
  return +pctChange(start, end).toFixed(1);
}

/** Top-N churches by a field, descending, excluding null/zero. */
export function topN(churches, field, n = 50, dir = 'desc') {
  return [...churches]
    .filter(c => c[field] != null && c[field] > 0)
    .sort((a, b) => {
      const diff = dir === 'desc' ? b[field] - a[field] : a[field] - b[field];
      if (diff !== 0) return diff;
      return (a.cid ?? 0) - (b.cid ?? 0);
    })
    .slice(0, n);
}

/** Derive per-state churches+members exactly the way build-data.mjs does. */
export function deriveStateTop20(churches) {
  const bySt = new Map();
  for (const c of churches) {
    const st = c.st || '';
    if (!st) continue;
    if (!bySt.has(st)) bySt.set(st, { state: st, churches: 0, members: 0 });
    const row = bySt.get(st);
    row.churches++;
    row.members += c.baptized || 0;
  }
  return [...bySt.values()].sort((a, b) => b.churches - a.churches).slice(0, 20);
}

export function deriveChurchSizes(churches) {
  const brackets = [
    { range: '0–49',   min: 0,    max: 49   },
    { range: '50–99',  min: 50,   max: 99   },
    { range: '100–199',min: 100,  max: 199  },
    { range: '200–499',min: 200,  max: 499  },
    { range: '500–999',min: 500,  max: 999  },
    { range: '1000+',  min: 1000, max: Infinity }
  ];
  const counts = brackets.map(() => 0);
  let withAtt = 0;
  for (const c of churches) {
    const att = c.att;
    if (att == null) continue;
    withAtt++;
    const i = brackets.findIndex(b => att >= b.min && att <= b.max);
    if (i >= 0) counts[i]++;
  }
  const total = withAtt || 1;
  return brackets.map((b, i) => ({
    range: b.range,
    count: counts[i],
    pct:   +((counts[i] / total) * 100).toFixed(1)
  }));
}

export function isFlatSeries(arr) {
  if (!arr?.length) return true;
  const first = arr[0];
  return arr.every(v => v === first);
}

export function scopedChurches(LCMS, district = 'all') {
  const churches = LCMS.churches || [];
  if (!district || district === 'all') return churches;
  return churches.filter(c => c.district === district);
}

/** Headline KPIs: scraped sums vs official totals — never the flat history-sample size. */
export function headlineKpis(LCMS, { district = 'all' } = {}) {
  const scoped = scopedChurches(LCMS, district);
  const lSum = (f) => scoped.reduce((a, c) => a + (c[f] || 0), 0);
  const local = {
    churches: scoped.filter(c => c.att != null || c.baptized != null).length,
    baptized: lSum('baptized') || null,
    attendance: lSum('att') || null,
    giving: lSum('giving') ? +(lSum('giving') / 1e6).toFixed(1) : null
  };
  let official;
  if (district === 'all') {
    official = {
      churches: LCMS.summary?.congregations ?? null,
      baptized: LCMS.summary?.baptizedMembers ?? null,
      attendance: LCMS.summary?.avgWeeklyAttendance ?? null,
      giving: LCMS.summary?.totalGivingMillions ?? null
    };
  } else {
    const d = (LCMS.districts || []).find(x => x.name === district) || {};
    official = {
      churches: d.churches ?? null,
      baptized: d.baptized ?? null,
      attendance: d.attendance ?? null,
      giving: d.giving ?? null
    };
  }
  return { local, official };
}

function avg(values) {
  const nums = values.filter(v => v != null && !Number.isNaN(Number(v))).map(Number);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function roundInt(v) { return v == null ? null : Math.round(v); }
function round1(v) { return v == null ? null : +v.toFixed(1); }

/**
 * Peer averages for congregations with similar communing membership.
 * Returns Map(cid -> similar object). Churches without communing are omitted.
 */
export function deriveSimilarPeers(churches, {
  metric = 'communing',
  relativeBand = 0.25,
  minPeers = 5,
  maxPeers = 30
} = {}) {
  const sorted = churches
    .filter(c => c[metric] != null && c[metric] > 0)
    .map(c => ({ church: c, cid: c.cid, value: c[metric] }))
    .sort((a, b) => a.value - b.value || (a.cid ?? 0) - (b.cid ?? 0));

  const out = new Map();
  for (let i = 0; i < sorted.length; i++) {
    const peers = peersForIndex(sorted, i, { relativeBand, minPeers, maxPeers });
    if (peers.length < Math.min(minPeers, sorted.length - 1)) continue;
    const list = peers.map(p => p.church);
    out.set(sorted[i].cid, {
      weeklyAttendance: roundInt(avg(list.map(c => c.att))),
      weeklyVisitors: roundInt(avg(list.map(c => c.weeklyVisitors))),
      percentVisitors: round1(avg(list.map(c => c.percentVisitors))),
      childBaptisms: round1(avg(list.map(c => c.baptisms))),
      confirmations: round1(avg(list.map(c => c.conf))),
      peerCount: list.length,
      basis: metric,
      band: relativeBand
    });
  }
  return out;
}

function peersForIndex(sorted, i, { relativeBand, minPeers, maxPeers }) {
  const v = sorted[i].value;
  const lo = v * (1 - relativeBand);
  const hi = v * (1 + relativeBand);
  let a = i;
  let b = i;
  while (a > 0 && sorted[a - 1].value >= lo) a--;
  while (b < sorted.length - 1 && sorted[b + 1].value <= hi) b++;

  let peers = [];
  for (let j = a; j <= b; j++) {
    if (j !== i) peers.push(sorted[j]);
  }

  if (peers.length < minPeers) {
    peers = [];
    let l = i - 1;
    let r = i + 1;
    while (peers.length < minPeers && (l >= 0 || r < sorted.length)) {
      const leftDist = l >= 0 ? v - sorted[l].value : Infinity;
      const rightDist = r < sorted.length ? sorted[r].value - v : Infinity;
      if (leftDist <= rightDist) {
        peers.push(sorted[l]);
        l--;
      } else {
        peers.push(sorted[r]);
        r++;
      }
    }
  }

  if (peers.length > maxPeers) {
    let lo = i;
    let hi = i;
    let got = 0;
    while (got < maxPeers) {
      const canL = lo > a;
      const canR = hi < b;
      if (!canL && !canR) break;
      if (!canL) {
        hi++;
        got++;
      } else if (!canR) {
        lo--;
        got++;
      } else if ((v - sorted[lo - 1].value) <= (sorted[hi + 1].value - v)) {
        lo--;
        got++;
      } else {
        hi++;
        got++;
      }
    }
    peers = [];
    for (let j = lo; j <= hi; j++) {
      if (j !== i) peers.push(sorted[j]);
    }
  }
  return peers;
}

export function describeSnapshot(LCMS) {
  const years = LCMS.yearly?.years || [];
  const churches = LCMS.churches || [];
  const withHistory = churches.filter(c => c.history?.years?.length).length;
  const yearCounts = new Map();
  for (const c of churches) {
    if (c.lastStatYear == null) continue;
    yearCounts.set(c.lastStatYear, (yearCounts.get(c.lastStatYear) || 0) + 1);
  }
  let headlineYear = null;
  let headlineYearCount = 0;
  for (const [year, n] of yearCounts) {
    if (n > headlineYearCount) {
      headlineYear = Number(year);
      headlineYearCount = n;
    }
  }
  const historyEnd = years.length ? years[years.length - 1] : null;
  const historyStart = years.length ? years[0] : null;
  return {
    churches: churches.length,
    officialCongregations: LCMS.summary?.congregations ?? null,
    withHistory,
    historyStart,
    historyEnd,
    headlineYear,
    fetchedAt: LCMS.fetchedAt ?? null
  };
}

export function snapshotLegendText(snap) {
  if (!snap) return '';
  const hist = (snap.historyStart != null && snap.historyEnd != null)
    ? `${snap.historyStart}–${snap.historyEnd}`
    : 'the history window';
  const head = snap.headlineYear != null ? String(snap.headlineYear) : 'the latest reported year';
  const official = snap.officialCongregations != null
    ? snap.officialCongregations.toLocaleString()
    : '—';
  return `Headlines are each church’s latest reported year (mostly ${head}). `
    + `Trend charts use ${hist} history for ${snap.withHistory.toLocaleString()} congregations. `
    + `Locator lists ${snap.churches.toLocaleString()} records; official synod count is ${official}. `
    + `Those figures are not interchangeable.`;
}
