import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { MAX_SQL_ROWS } from '../lib/sql-read-query.mjs';
import { closeConsoleDb, executeSql, listTables } from '../lib/sql-console.mjs';
import { DB_PATH, requireDb } from './helpers.mjs';

after(() => closeConsoleDb());

describe('SQL console', () => {
  it('runs a SELECT against the snapshot', () => {
    requireDb();
    const result = executeSql(DB_PATH, 'SELECT 1 AS n');
    assert.equal(result.success, true);
    assert.deepEqual(result.results, [{ n: 1 }]);
  });

  it('rejects writes and hidden tables', () => {
    requireDb();
    const write = executeSql(DB_PATH, 'DELETE FROM churches');
    assert.equal(write.success, false);
    const hidden = executeSql(DB_PATH, 'SELECT * FROM build_meta');
    assert.equal(hidden.success, false);
    assert.match(hidden.error, /build_meta/);
    const summary = executeSql(DB_PATH, 'SELECT * FROM synod_summary');
    assert.equal(summary.success, false);
  });

  it('hides internal tables from the sidebar', () => {
    requireDb();
    const { tables } = listTables(DB_PATH);
    assert.ok(!tables.includes('build_meta'));
    assert.ok(!tables.includes('synod_summary'));
    assert.ok(tables.includes('churches'));
  });

  it('truncates oversized result sets', () => {
    requireDb();
    const result = executeSql(DB_PATH, 'SELECT lookup_id FROM church_yearly');
    assert.equal(result.success, true);
    assert.equal(result.truncated, true);
    assert.equal(result.row_count, MAX_SQL_ROWS);
    assert.equal(result.results.length, MAX_SQL_ROWS);
  });
});
