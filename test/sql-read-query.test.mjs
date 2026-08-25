import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isReadQuery, MAX_SQL_ROWS, truncateRows } from '../lib/sql-read-query.mjs';

describe('isReadQuery', () => {
  it('allows select, with, pragma, and explain', () => {
    assert.equal(isReadQuery('SELECT 1'), true);
    assert.equal(isReadQuery('  /* note */ SELECT name FROM churches'), true);
    assert.equal(isReadQuery('WITH x AS (SELECT 1) SELECT * FROM x'), true);
    assert.equal(isReadQuery('PRAGMA table_info(churches)'), true);
    assert.equal(isReadQuery('EXPLAIN QUERY PLAN SELECT 1'), true);
  });

  it('allows replace() as a SQL function', () => {
    assert.equal(isReadQuery("SELECT replace(name, 'Lutheran', 'Luth.') FROM churches"), true);
  });

  it('allows CREATE inside a string literal', () => {
    assert.equal(isReadQuery("SELECT * FROM churches WHERE name = 'CREATE'"), true);
  });

  it('rejects writes, stacked statements, and WITH ... INSERT', () => {
    assert.equal(isReadQuery('INSERT INTO churches (name) VALUES (\'x\')'), false);
    assert.equal(isReadQuery('UPDATE churches SET name = \'x\''), false);
    assert.equal(isReadQuery('DELETE FROM churches'), false);
    assert.equal(isReadQuery('DROP TABLE churches'), false);
    assert.equal(isReadQuery('SELECT 1; DROP TABLE churches'), false);
    assert.equal(isReadQuery('WITH x AS (SELECT 1) INSERT INTO churches (name) SELECT \'x\''), false);
    assert.equal(isReadQuery('ATTACH DATABASE \'other.db\' AS o'), false);
  });

  it('rejects empty queries', () => {
    assert.equal(isReadQuery(''), false);
    assert.equal(isReadQuery('   '), false);
  });
});

describe('truncateRows', () => {
  it('caps at MAX_SQL_ROWS', () => {
    const { rows, truncated, row_count } = truncateRows(Array.from({ length: MAX_SQL_ROWS + 5 }, (_, i) => i));
    assert.equal(truncated, true);
    assert.equal(rows.length, MAX_SQL_ROWS);
    assert.equal(row_count, MAX_SQL_ROWS);
  });
});
