// Reconstruct the dashboard LCMS object from data/lcms.db.

import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleLcms } from './map-lcms.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DB = join(ROOT, 'data', 'lcms.db');

const DISTRICT_SQL = `
  SELECT
    lookup_id, name, member_congregations, baptized_members, communicant_members,
    attendance, giving_millions
  FROM districts
  ORDER BY lookup_id
`;

const CHURCH_SQL = `
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
`;

/**
 * @param {string} [dbPath]
 * @returns {object}
 */
export function loadLcmsFromDb(dbPath = DEFAULT_DB) {
  const db = new Database(dbPath, { readonly: true });
  db.pragma('foreign_keys = ON');

  try {
    return assembleLcms({
      meta: db.prepare('SELECT * FROM build_meta WHERE id = 1').get(),
      summaryRow: db.prepare('SELECT * FROM synod_summary WHERE id = 1').get(),
      yearlyRows: db.prepare('SELECT * FROM national_yearly ORDER BY year').all(),
      districtRows: db.prepare(DISTRICT_SQL).all(),
      churchRows: db.prepare(CHURCH_SQL).all(),
      schoolRows: db.prepare(`
        SELECT lookup_id, school_lookup_id, school_name, city, state
        FROM church_schools
      `).all(),
      ministryRows: db.prepare(`
        SELECT lookup_id, ministry, category FROM church_ministries
      `).all(),
      historyRows: db.prepare(`
        SELECT lookup_id, year, baptized, confirmed, attendance
        FROM church_yearly
        ORDER BY lookup_id, year
      `).all(),
      source: 'sqlite'
    });
  } finally {
    db.close();
  }
}

export default loadLcmsFromDb;
