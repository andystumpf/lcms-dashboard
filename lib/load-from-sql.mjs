// Reconstruct the dashboard LCMS object from data/lcms.db.

import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normDistrictName } from './district-name.mjs';
import { deriveStateTop20, deriveChurchSizes } from './dashboard-math.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DB = join(ROOT, 'data', 'lcms.db');

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

function loadSchools(db, lookupId) {
  return db.prepare(`
    SELECT school_lookup_id, school_name, city, state
    FROM church_schools WHERE lookup_id = ?
  `).all(lookupId).map(s => ({
    school: {
      lookupId: s.school_lookup_id,
      name: s.school_name,
      addresses: s.city || s.state ? [{ city: s.city, state: s.state }] : []
    }
  }));
}

function loadMinistries(db, lookupId) {
  return db.prepare(`
    SELECT ministry, category FROM church_ministries WHERE lookup_id = ?
  `).all(lookupId).map(m => ({ type: m.ministry, category: m.category }));
}

function loadHistory(db, lookupId) {
  const rows = db.prepare(`
    SELECT year, baptized, confirmed, attendance
    FROM church_yearly WHERE lookup_id = ? ORDER BY year
  `).all(lookupId);
  if (!rows.length) return null;
  return {
    years: rows.map(r => r.year),
    baptized: rows.map(r => r.baptized),
    confirmed: rows.map(r => r.confirmed),
    attendance: rows.map(r => r.attendance)
  };
}

/**
 * @param {string} [dbPath]
 * @returns {import('../js/data.js').LCMS & { fetchedAt: string, source: string }}
 */
export function loadLcmsFromDb(dbPath = DEFAULT_DB) {
  const db = new Database(dbPath, { readonly: true });
  db.pragma('foreign_keys = ON');

  const meta = db.prepare('SELECT * FROM build_meta WHERE id = 1').get();
  const summaryRow = db.prepare('SELECT * FROM synod_summary WHERE id = 1').get();
  const yearlyRows = db.prepare('SELECT * FROM national_yearly ORDER BY year').all();

  const districtRows = db.prepare(`
    SELECT
      lookup_id, name, member_congregations, baptized_members, communicant_members,
      attendance, giving_millions
    FROM districts
    ORDER BY lookup_id
  `).all();

  const districts = districtRows.map(d => ({
    id: d.lookup_id,
    name: normDistrictName(d.name),
    churches: d.member_congregations,
    baptized: d.baptized_members,
    communing: d.communicant_members,
    attendance: d.attendance ?? null,
    giving: d.giving_millions ?? null
  }));

  const churchRows = db.prepare(`
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
  `).all();

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
      schools: loadSchools(db, c.lookup_id),
      ministries: loadMinistries(db, c.lookup_id),
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
      history: loadHistory(db, c.lookup_id)
    };
  });

  db.close();

  const out = {
    fetchedAt: meta?.fetched_at ?? summaryRow?.updated_at ?? new Date().toISOString(),
    source: meta?.source ?? 'sqlite',
    summary: mapSummary(summaryRow),
    yearly: mapYearly(yearlyRows),
    districts,
    churches,
    stateTop20: deriveStateTop20(churches),
    churchSizes: deriveChurchSizes(churches)
  };

  return out;
}

export default loadLcmsFromDb;
