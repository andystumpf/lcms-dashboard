// Pure Ten-Year Story aggregations. js/story-charts.js must stay aligned.

export function histVal(c, field, year) {
  const h = c?.history;
  if (!h) return null;
  const i = h.years.indexOf(year);
  return i >= 0 ? h[field]?.[i] : null;
}

export function churchesWithHistory(churches, minYears = 1) {
  return (churches || []).filter(c => (c.history?.years?.length || 0) >= minYears);
}

export function medianByYear(churches, years, field) {
  const list = churchesWithHistory(churches, 1);
  return (years || []).map(y => {
    const vals = list
      .map(c => histVal(c, field, y))
      .filter(v => v != null && v > 0)
      .sort((a, b) => a - b);
    if (!vals.length) return null;
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  });
}

export function shareUnder(churches, field, threshold, year) {
  const list = churchesWithHistory(churches, 1);
  let n = 0, d = 0;
  for (const c of list) {
    const v = histVal(c, field, year);
    if (v != null) { d++; if (v < threshold) n++; }
  }
  return d ? +((n / d) * 100).toFixed(1) : null;
}

export function shareOver(churches, field, threshold, year) {
  const list = churchesWithHistory(churches, 1);
  let n = 0, d = 0;
  for (const c of list) {
    const v = histVal(c, field, year);
    if (v != null) { d++; if (v >= threshold) n++; }
  }
  return d ? +((n / d) * 100).toFixed(1) : null;
}

export function churchChangePct(churches, years, field) {
  if (!years || years.length < 2) return null;
  const y0 = years[0], y1 = years[years.length - 1];
  return churchesWithHistory(churches, 2).map(c => {
    const a0 = histVal(c, field, y0), a1 = histVal(c, field, y1);
    if (a0 == null || a1 == null || a0 === 0) return null;
    return { c, pct: ((a1 - a0) / a0) * 100 };
  }).filter(Boolean);
}

export function histBuckets(changes) {
  const labels = ['< −30%', '−30 to −15%', '−15 to −5%', '−5 to +5%', '+5 to +15%', '+15 to +30%', '> +30%'];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const { pct } of changes || []) {
    if (pct < -30) counts[0]++;
    else if (pct < -15) counts[1]++;
    else if (pct < -5) counts[2]++;
    else if (pct <= 5) counts[3]++;
    else if (pct <= 15) counts[4]++;
    else if (pct <= 30) counts[5]++;
    else counts[6]++;
  }
  return { labels, counts };
}

export function idx100(arr) {
  if (!arr?.length || arr[0] == null || arr[0] === 0) return (arr || []).map(() => null);
  const b = arr[0];
  return arr.map(v => v == null ? null : +((v / b) * 100).toFixed(1));
}

export function yoyPct(arr) {
  return (arr || []).map((v, i) => {
    if (i === 0 || v == null || arr[i - 1] == null || arr[i - 1] === 0) return null;
    return +(((v - arr[i - 1]) / arr[i - 1]) * 100).toFixed(1);
  });
}

export function roll3(arr) {
  return (arr || []).map((_, i) => {
    const w = arr.slice(Math.max(0, i - 2), i + 1).filter(v => v != null);
    return w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : null;
  });
}

export function scopedChurches(churches, district = 'all') {
  if (!district || district === 'all') return churches || [];
  return (churches || []).filter(c => c.district === district);
}

/** Run the story aggregations that the UI draws. Throws are collected, not swallowed. */
export function evaluateStoryMath(LCMS, { districts = ['all', 'Texas'] } = {}) {
  const errors = [];
  const years = LCMS.yearly?.years || [];
  const last = years.length ? years[years.length - 1] : null;
  for (const district of districts) {
    try {
      const churches = scopedChurches(LCMS.churches, district);
      medianByYear(churches, years, 'attendance');
      medianByYear(churches, years, 'baptized');
      if (last != null) {
        shareUnder(churches, 'attendance', 50, last);
        shareOver(churches, 'attendance', 500, last);
      }
      churchChangePct(churches, years, 'attendance');
      histBuckets(churchChangePct(churches, years, 'baptized') || []);
      idx100(LCMS.yearly?.baptizedMembers || []);
      yoyPct(LCMS.yearly?.avgWeeklyAttendance || []);
      roll3(LCMS.yearly?.avgWeeklyAttendance || []);
    } catch (err) {
      errors.push(`${district}: ${err.message || err}`);
    }
  }
  return { errors };
}

export function districtHeadlineVsHistory(district, districtYearly, years) {
  const series = districtYearly?.[district?.name];
  const list = years || [];
  if (!district || !series || !list.length) {
    return { comparable: false };
  }
  const yi = list.length - 1;
  const historyBaptized = series.baptizedMembers?.[yi] ?? null;
  const historyAttendance = series.avgWeeklyAttendance?.[yi] ?? null;
  return {
    comparable: historyBaptized != null || historyAttendance != null,
    historyEnd: list[yi],
    pdfBaptized: district.baptized ?? null,
    historyBaptized,
    pdfAttendance: district.attendance ?? null,
    historyAttendance,
    baptizedMatch: district.baptized === historyBaptized,
    attendanceMatch: district.attendance === historyAttendance
  };
}

export const LEAGUE_TABLE_SUBTITLE =
  'PDF district headlines · not the history-window sums used in trend charts · ranked by congregations';
