// Shared LCMS payload mapping used by SQLite and D1 loaders.

import { normDistrictName } from './district-name.mjs';
import {
  deriveChurchSizes,
  deriveSimilarPeers,
  deriveStateTop20,
  describeSnapshot
} from './dashboard-math.mjs';

export function mapSummary(row) {
  if (!row) return null;
  return {
    congregations: row.congregations_official,
    districts: row.districts_official,
    schools: row.schools_official,
    workers: row.workers_official,
    baptizedMembers: row.baptized_members_official,
    communingMembers: row.communing_members_official,
    avgWeeklyAttendance: row.avg_weekly_attendance_official,
    totalGivingMillions: row.total_giving_millions_official,
    local: {
      congregations: row.congregations_scraped,
      congregationsWithStats: row.congregations_with_stats,
      baptizedMembers: row.baptized_members_scraped,
      communingMembers: row.communing_members_scraped,
      avgWeeklyAttendance: row.avg_weekly_attendance_scraped,
      totalGivingMillions: row.total_giving_millions_scraped
    }
  };
}

export function mapYearly(rows) {
  if (!rows.length) {
    return {
      years: [], baptizedMembers: [], communingMembers: [], avgWeeklyAttendance: [],
      congregations: [], sampleSize: [], totalGivingMillions: [], atHomeMillions: [],
      infantBaptisms: [], adultBaptisms: [], confirmations: [], newMembers: [], removals: []
    };
  }
  return {
    years: rows.map(r => r.year),
    baptizedMembers: rows.map(r => r.baptized_members),
    communingMembers: rows.map(r => r.communing_members),
    avgWeeklyAttendance: rows.map(r => r.avg_weekly_attendance),
    congregations: rows.map(r => r.congregations),
    sampleSize: rows.map(r => r.sample_size),
    totalGivingMillions: rows.map(r => r.total_giving_millions),
    atHomeMillions: rows.map(r => r.at_home_millions),
    infantBaptisms: rows.map(r => r.infant_baptisms),
    adultBaptisms: rows.map(r => r.adult_baptisms),
    confirmations: rows.map(r => r.confirmations),
    newMembers: rows.map(r => r.new_members),
    removals: rows.map(r => r.removals)
  };
}

export function mapDistricts(districtRows) {
  return districtRows.map(d => ({
    id: d.lookup_id,
    name: normDistrictName(d.name),
    churches: d.member_congregations,
    baptized: d.baptized_members,
    communing: d.communicant_members,
    attendance: d.attendance ?? null,
    giving: d.giving_millions ?? null
  }));
}

export function mapSchools(rows) {
  return rows.map(s => ({
    school: {
      lookupId: s.school_lookup_id,
      name: s.school_name,
      addresses: s.city || s.state ? [{ city: s.city, state: s.state }] : []
    }
  }));
}

export function mapMinistries(rows) {
  return rows.map(m => ({ type: m.ministry, category: m.category }));
}

export function mapHistory(rows) {
  if (!rows.length) return null;
  return {
    years: rows.map(r => r.year),
    baptized: rows.map(r => r.baptized),
    confirmed: rows.map(r => r.confirmed),
    attendance: rows.map(r => r.attendance)
  };
}

export function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = row[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

export function mapChurchRow(c, { schools = [], ministries = [], history = [] } = {}) {
  const junior = c.junior_confirmations;
  const adult = c.adult_confirmations;
  const conf = (junior == null && adult == null) ? null : (junior || 0) + (adult || 0);
  const giving = c.contributions;
  const bap = c.baptized;
  return {
    cid: c.lookup_id,
    uuid: c.uuid,
    name: c.name,
    address: c.address,
    city: c.city || '',
    st: c.state || '',
    zip: c.zip,
    lat: c.lat,
    lng: c.lng,
    phone: c.phone,
    email: c.email,
    website: c.website,
    status: c.status,
    district: normDistrictName(c.district_name),
    districtLookupId: c.district_lookup_id,
    circuit: c.circuit_name ? { id: c.circuit_lookup_id, name: c.circuit_name } : null,
    dateOrganized: c.date_organized,
    lastStatYear: c.last_stat_year ?? c.report_year,
    reportYear: c.report_year ?? null,
    schools: mapSchools(schools),
    ministries: mapMinistries(ministries),
    similar: null,
    services: [],
    att: c.attendance,
    baptized: bap,
    communing: c.communing,
    giving,
    ss: null,
    conf,
    baptisms: c.child_baptisms,
    weeklyVisitors: c.weekly_visitors,
    percentVisitors: c.percent_visitors,
    atHomeExpenses: c.at_home_expenses,
    contribsPerConfirmedMember: c.contribs_per_confirmed_member,
    expensesPerBaptizedMember: c.expenses_per_baptized_member,
    perMemberGiving: c.per_member_giving
      ?? c.contribs_per_confirmed_member
      ?? ((giving && bap) ? Math.round(giving / bap) : null),
    history: mapHistory(history)
  };
}

export function assembleLcms({
  meta,
  summaryRow,
  yearlyRows,
  districtRows,
  churchRows,
  schoolRows,
  ministryRows,
  historyRows,
  source
}) {
  const districts = mapDistricts(districtRows);
  const schoolsById = groupBy(schoolRows, 'lookup_id');
  const ministriesById = groupBy(ministryRows, 'lookup_id');
  const historyById = groupBy(historyRows, 'lookup_id');

  const churches = churchRows.map(c => mapChurchRow(c, {
    schools: schoolsById.get(c.lookup_id) ?? [],
    ministries: ministriesById.get(c.lookup_id) ?? [],
    history: historyById.get(c.lookup_id) ?? []
  }));

  attachSimilarPeers(churches);

  const yearly = mapYearly(yearlyRows);
  const summary = mapSummary(summaryRow);
  const out = {
    fetchedAt: meta?.fetched_at ?? summaryRow?.updated_at ?? new Date().toISOString(),
    source: meta?.source ?? source,
    summary,
    yearly,
    districts,
    churches,
    stateTop20: deriveStateTop20(churches),
    churchSizes: deriveChurchSizes(churches)
  };
  out.snapshot = describeSnapshot(out);
  return out;
}

export function attachSimilarPeers(churches) {
  const byCid = deriveSimilarPeers(churches);
  for (const c of churches) {
    c.similar = byCid.get(c.cid) ?? null;
  }
  return churches;
}
