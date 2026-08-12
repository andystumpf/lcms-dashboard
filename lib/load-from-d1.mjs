// Reconstruct the dashboard LCMS object from a D1 binding (batched queries).

import { normDistrictName } from './district-name.mjs';
import { deriveStateTop20, deriveChurchSizes } from './dashboard-math.mjs';

function mapSummary(row) {
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

function mapYearly(rows) {
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

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = row[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

async function all(db, sql, ...params) {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  const { results } = await bound.all();
  return results ?? [];
}

async function get(db, sql, ...params) {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  return bound.first();
}

function mapSchools(rows) {
  return rows.map(s => ({
    school: {
      lookupId: s.school_lookup_id,
      name: s.school_name,
      addresses: s.city || s.state ? [{ city: s.city, state: s.state }] : []
    }
  }));
}

function mapMinistries(rows) {
  return rows.map(m => ({ type: m.ministry, category: m.category }));
}

function mapHistory(rows) {
  if (!rows.length) return null;
  return {
    years: rows.map(r => r.year),
    baptized: rows.map(r => r.baptized),
    confirmed: rows.map(r => r.confirmed),
    attendance: rows.map(r => r.attendance)
  };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function loadLcmsFromD1(db) {
  const [
    meta,
    summaryRow,
    yearlyRows,
    districtRows,
    churchRows,
    schoolRows,
    ministryRows,
    historyRows
  ] = await Promise.all([
    get(db, 'SELECT * FROM build_meta WHERE id = 1'),
    get(db, 'SELECT * FROM synod_summary WHERE id = 1'),
    all(db, 'SELECT * FROM national_yearly ORDER BY year'),
    all(db, `
      SELECT
        lookup_id, name, member_congregations, baptized_members, communicant_members,
        attendance, giving_millions
      FROM districts
      ORDER BY lookup_id
    `),
    all(db, `
      SELECT
        c.lookup_id, c.uuid, c.name, c.status, c.date_organized, c.last_stat_year,
        c.address, c.city, c.state, c.zip, c.lat, c.lng, c.phone, c.email, c.website,
        c.district_lookup_id, c.circuit_lookup_id, c.circuit_name,
        c.attendance, c.baptized, c.communing,
        f.report_year, f.contributions, f.at_home_expenses,
        f.contribs_per_confirmed_member, f.expenses_per_baptized_member,
        f.child_baptisms, f.junior_confirmations, f.adult_confirmations,
        f.weekly_visitors, f.percent_visitors, f.similar_churches, f.per_member_giving,
        d.name AS district_name
      FROM churches c
      LEFT JOIN church_financials f ON f.lookup_id = c.lookup_id
      LEFT JOIN districts d ON d.lookup_id = c.district_lookup_id
      ORDER BY c.lookup_id
    `),
    all(db, `
      SELECT lookup_id, school_lookup_id, school_name, city, state
      FROM church_schools
    `),
    all(db, `
      SELECT lookup_id, ministry, category FROM church_ministries
    `),
    all(db, `
      SELECT lookup_id, year, baptized, confirmed, attendance
      FROM church_yearly
      ORDER BY lookup_id, year
    `)
  ]);

  const schoolsById = groupBy(schoolRows, 'lookup_id');
  const ministriesById = groupBy(ministryRows, 'lookup_id');
  const historyById = groupBy(historyRows, 'lookup_id');

  const districts = districtRows.map(d => ({
    id: d.lookup_id,
    name: normDistrictName(d.name),
    churches: d.member_congregations,
    baptized: d.baptized_members,
    communing: d.communicant_members,
    attendance: d.attendance ?? null,
    giving: d.giving_millions ?? null
  }));

  const churches = churchRows.map(c => {
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
      schools: mapSchools(schoolsById.get(c.lookup_id) ?? []),
      ministries: mapMinistries(ministriesById.get(c.lookup_id) ?? []),
      similar: c.similar_churches,
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
      history: mapHistory(historyById.get(c.lookup_id) ?? [])
    };
  });

  return {
    fetchedAt: meta?.fetched_at ?? summaryRow?.updated_at ?? new Date().toISOString(),
    source: meta?.source ?? 'd1',
    summary: mapSummary(summaryRow),
    yearly: mapYearly(yearlyRows),
    districts,
    churches,
    stateTop20: deriveStateTop20(churches),
    churchSizes: deriveChurchSizes(churches)
  };
}

export default loadLcmsFromD1;
