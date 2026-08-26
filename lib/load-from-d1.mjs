// Reconstruct the dashboard LCMS object from a D1 binding (batched queries).

import { assembleLcms } from './map-lcms.mjs';
import {
  CHURCH_SQL,
  DISTRICT_SQL,
  HISTORY_SQL,
  META_SQL,
  MINISTRY_SQL,
  SCHOOL_SQL,
  SUMMARY_SQL,
  YEARLY_SQL
} from './lcms-queries.mjs';

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
    get(db, META_SQL),
    get(db, SUMMARY_SQL),
    all(db, YEARLY_SQL),
    all(db, DISTRICT_SQL),
    all(db, CHURCH_SQL),
    all(db, SCHOOL_SQL),
    all(db, MINISTRY_SQL),
    all(db, HISTORY_SQL)
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
