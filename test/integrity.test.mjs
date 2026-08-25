import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';

import { DB_PATH, requireDb } from './helpers.mjs';

function db() {
  requireDb();
  return new Database(DB_PATH, { readonly: true });
}

describe('SQLite snapshot integrity', () => {
  it('matches build_meta counts and has 35 districts', () => {
    const conn = db();
    try {
      const meta = conn.prepare('SELECT * FROM build_meta WHERE id = 1').get();
      const churches = conn.prepare('SELECT COUNT(*) AS n FROM churches').get().n;
      const districts = conn.prepare('SELECT COUNT(*) AS n FROM districts').get().n;
      const yearlyRows = conn.prepare('SELECT COUNT(*) AS n FROM church_yearly').get().n;
      assert.equal(districts, 35);
      assert.equal(churches, meta.church_count);
      assert.equal(yearlyRows, meta.yearly_rows);
      assert.ok(churches >= 5000);
    } finally {
      conn.close();
    }
  });

  it('has no orphan yearly, financial, or church-district rows', () => {
    const conn = db();
    try {
      const yearly = conn.prepare(`
        SELECT COUNT(*) AS n FROM church_yearly
        WHERE lookup_id NOT IN (SELECT lookup_id FROM churches)
      `).get().n;
      const financials = conn.prepare(`
        SELECT COUNT(*) AS n FROM church_financials
        WHERE lookup_id NOT IN (SELECT lookup_id FROM churches)
      `).get().n;
      const noDistrict = conn.prepare(`
        SELECT COUNT(*) AS n FROM churches
        WHERE district_lookup_id IS NULL
           OR district_lookup_id NOT IN (SELECT lookup_id FROM districts)
      `).get().n;
      assert.equal(yearly, 0);
      assert.equal(financials, 0);
      assert.equal(noDistrict, 0);
    } finally {
      conn.close();
    }
  });

  it('keeps national_yearly in lockstep with SUM(church_yearly)', () => {
    const conn = db();
    try {
      const rows = conn.prepare(`
        SELECT
          n.year,
          n.baptized_members AS nat_bap,
          n.communing_members AS nat_conf,
          n.avg_weekly_attendance AS nat_att,
          n.congregations AS nat_cong,
          n.sample_size,
          y.n AS hist_n,
          y.bap AS hist_bap,
          y.conf AS hist_conf,
          y.att AS hist_att
        FROM national_yearly n
        JOIN (
          SELECT year, COUNT(*) AS n, SUM(baptized) AS bap, SUM(confirmed) AS conf, SUM(attendance) AS att
          FROM church_yearly
          GROUP BY year
        ) y ON y.year = n.year
        ORDER BY n.year
      `).all();
      assert.ok(rows.length >= 8);
      for (const r of rows) {
        assert.equal(r.nat_bap, r.hist_bap, `baptized ${r.year}`);
        assert.equal(r.nat_conf, r.hist_conf, `communing ${r.year}`);
        assert.equal(r.nat_att, r.hist_att, `attendance ${r.year}`);
        assert.equal(r.nat_cong, r.hist_n);
        assert.equal(r.sample_size, r.hist_n);
        assert.equal(r.nat_cong, r.sample_size);
      }
    } finally {
      conn.close();
    }
  });

  it('documents official vs scraped vs history-sample congregation counts', () => {
    const conn = db();
    try {
      const summary = conn.prepare('SELECT * FROM synod_summary WHERE id = 1').get();
      const churches = conn.prepare('SELECT COUNT(*) AS n FROM churches').get().n;
      const withHistory = conn.prepare('SELECT COUNT(DISTINCT lookup_id) AS n FROM church_yearly').get().n;
      const uniqueCong = conn.prepare(`
        SELECT COUNT(DISTINCT congregations) AS n FROM national_yearly
      `).get().n;

      assert.equal(summary.districts_official, 35);
      assert.equal(summary.congregations_scraped, churches);
      assert.notEqual(summary.congregations_official, churches);
      assert.notEqual(summary.congregations_official, withHistory);
      assert.notEqual(churches, withHistory);
      assert.equal(uniqueCong, 1, 'national_yearly.congregations is a constant sample size, not synod size over time');
      assert.equal(withHistory, conn.prepare('SELECT congregations FROM national_yearly ORDER BY year DESC LIMIT 1').get().congregations);
    } finally {
      conn.close();
    }
  });

  it('records last_stat_year after the history window for most churches', () => {
    const conn = db();
    try {
      const maxHist = conn.prepare('SELECT MAX(year) AS y FROM church_yearly').get().y;
      const mismatches = conn.prepare(`
        SELECT COUNT(*) AS n
        FROM churches c
        JOIN church_yearly y ON y.lookup_id = c.lookup_id AND y.year = ?
        WHERE c.baptized IS NOT NULL AND y.baptized IS NOT NULL AND c.baptized != y.baptized
      `).get(maxHist).n;
      assert.ok(maxHist >= 2020);
      assert.ok(mismatches > 100, 'headline baptized vs last history year should differ for a large share of churches');
    } finally {
      conn.close();
    }
  });
});
