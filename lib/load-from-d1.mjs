// Reconstruct the dashboard LCMS object from a D1 binding (batched queries).

import { assembleLcms } from './map-lcms.mjs';

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

  return assembleLcms({
    meta,
    summaryRow,
    yearlyRows,
    districtRows,
    churchRows,
    schoolRows,
    ministryRows,
    historyRows,
    source: 'd1'
  });
}

export default loadLcmsFromD1;
