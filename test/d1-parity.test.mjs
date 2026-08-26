import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import Database from 'better-sqlite3';

import { sqliteAsD1 } from '../lib/sqlite-as-d1.mjs';
import worker, { resetWorkerCache } from '../worker/index.mjs';
import { DB_PATH, requireDb } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('D1 / SQLite query lockstep', () => {
  it('loads snapshot queries from one module', async () => {
    const d1 = await readFile(join(ROOT, 'lib/load-from-d1.mjs'), 'utf8');
    const sql = await readFile(join(ROOT, 'lib/load-from-sql.mjs'), 'utf8');
    assert.match(d1, /from '\.\/lcms-queries\.mjs'/);
    assert.match(sql, /from '\.\/lcms-queries\.mjs'/);
    assert.match(d1, /HISTORY_SQL/);
    assert.match(sql, /HISTORY_SQL/);
  });
});

describe('Worker D1 smoke', () => {
  let db;
  let d1;

  before(() => {
    requireDb();
    db = new Database(DB_PATH, { readonly: true });
    d1 = sqliteAsD1(db);
    resetWorkerCache();
  });

  after(() => {
    resetWorkerCache();
    db?.close();
  });

  it('serves /api/health from the Worker with source d1', async () => {
    const res = await worker.fetch(new Request('http://lcms.test/api/health'), { DB: d1 });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, 'd1');
    assert.equal(body.ok, true);
    assert.equal(body.duplicateNameGroups, 23);
    assert.ok(body.districtYearly >= 35);
    assert.ok(body.givingHeadlineMillions > body.givingHistoryMillions);
    assert.equal(body.storyMathErrors, 0);
  });

  it('runs a read-only SQL query and rejects writes', async () => {
    const ok = await worker.fetch(new Request('http://lcms.test/api/sql/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'SELECT 1 AS n' })
    }), { DB: d1 });
    assert.equal(ok.status, 200);
    const okBody = await ok.json();
    assert.equal(okBody.success, true);
    assert.deepEqual(okBody.results, [{ n: 1 }]);

    const bad = await worker.fetch(new Request('http://lcms.test/api/sql/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'DROP TABLE churches' })
    }), { DB: d1 });
    assert.equal(bad.status, 400);
    const badBody = await bad.json();
    assert.equal(badBody.success, false);
  });
});
