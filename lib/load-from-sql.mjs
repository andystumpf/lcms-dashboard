// Reconstruct the dashboard LCMS object from data/lcms.db.

import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DB = join(ROOT, 'data', 'lcms.db');

/**
 * @param {string} [dbPath]
 * @returns {object}
 */
export function loadLcmsFromDb(dbPath = DEFAULT_DB) {
  const db = new Database(dbPath, { readonly: true });
  db.pragma('foreign_keys = ON');

  try {
    return assembleLcms({
      meta: db.prepare(META_SQL).get(),
      summaryRow: db.prepare(SUMMARY_SQL).get(),
      yearlyRows: db.prepare(YEARLY_SQL).all(),
      districtRows: db.prepare(DISTRICT_SQL).all(),
      churchRows: db.prepare(CHURCH_SQL).all(),
      schoolRows: db.prepare(SCHOOL_SQL).all(),
      ministryRows: db.prepare(MINISTRY_SQL).all(),
      historyRows: db.prepare(HISTORY_SQL).all(),
      source: 'sqlite'
    });
  } finally {
    db.close();
  }
}

export default loadLcmsFromDb;
