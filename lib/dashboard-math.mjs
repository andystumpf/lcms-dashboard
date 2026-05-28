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

/** Scale a national yearly series by the selected district's share. */
export function scaleSeries(natSeries, district, districtField) {
  if (!district || !natSeries.length) return natSeries.slice();
  const natLast = natSeries[natSeries.length - 1];
  if (!natLast) return natSeries.slice();
  const ratio = (district[districtField] ?? 0) / natLast;
  return natSeries.map(v => v * ratio);
}

export function scopedKpiSeries(LCMS, { district = 'all', startYear, endYear }) {
  const years = LCMS.yearly.years || [];
  const { startIdx, endIdx } = yearBounds(years, startYear, endYear);
  const slice = (field, df) => {
    const nat = LCMS.yearly[field] || [];
    const d = district === 'all' ? null : LCMS.districts.find(x => x.name === district);
    return scaleSeries(nat, d, df).slice(startIdx, endIdx + 1);
  };
  return {
    cong: slice('congregations',       'churches'  ).map(Math.round),
    bap:  slice('baptizedMembers',     'baptized'  ).map(Math.round),
    att:  slice('avgWeeklyAttendance', 'attendance').map(Math.round),
    giv:  slice('totalGivingMillions', 'giving'    )
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
