// SQL console backend — execute queries, browse schema, saved-query CRUD.

import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isReadQuery, MAX_SQL_ROWS } from './sql-read-query.mjs';
import {
  isHiddenTable,
  referencesHiddenTable,
  hiddenTableError,
  LIST_TABLES_FILTER
} from './sql-console-hidden.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SAVED_QUERIES_PATH = join(ROOT, 'data', 'sql-saved-queries.json');

let consoleDb = null;
let consoleDbPath = null;

function getConsoleDb(dbPath) {
  if (!consoleDb || consoleDbPath !== dbPath) {
    consoleDb?.close();
    consoleDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    consoleDbPath = dbPath;
  }
  return consoleDb;
}

export function closeConsoleDb() {
  consoleDb?.close();
  consoleDb = null;
  consoleDbPath = null;
}

function readSavedQueries() {
  if (!existsSync(SAVED_QUERIES_PATH)) return [];
  try {
    return JSON.parse(readFileSync(SAVED_QUERIES_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeSavedQueries(queries) {
  writeFileSync(SAVED_QUERIES_PATH, JSON.stringify(queries, null, 2) + '\n', 'utf8');
}

export function executeSql(dbPath, query) {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    return { success: false, error: 'No query provided', message: 'No query provided' };
  }
  if (!isReadQuery(trimmed)) {
    return {
      success: false,
      error: 'Only read-only SELECT queries are allowed',
      message: 'Only read-only SELECT queries are allowed'
    };
  }

  const hidden = referencesHiddenTable(trimmed);
  if (hidden) {
    const error = hiddenTableError(hidden);
    return { success: false, error, message: error };
  }

  const db = getConsoleDb(dbPath);
  const start = Date.now();

  try {
    const stmt = db.prepare(trimmed);
    const results = [];
    let truncated = false;
    for (const row of stmt.iterate()) {
      if (results.length >= MAX_SQL_ROWS) {
        truncated = true;
        break;
      }
      results.push(row);
    }
    const columns = results.length
      ? Object.keys(results[0])
      : stmt.columns().map(c => c.name);
    const extra = truncated
      ? ` Results truncated to ${MAX_SQL_ROWS} rows.`
      : '';
    return {
      success: true,
      type: 'SELECT',
      columns,
      results,
      row_count: results.length,
      truncated,
      execution_time: Date.now() - start,
      message: `Query executed successfully. ${results.length} rows returned.${extra}`
    };
  } catch (err) {
    return { success: false, error: err.message, message: err.message };
  }
}

export function runTransaction() {
  return { success: false, error: 'Transactions are disabled (read-only mode)' };
}

export function listTables(dbPath) {
  const db = getConsoleDb(dbPath);
  const rows = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ${LIST_TABLES_FILTER}
    ORDER BY name
  `).all();
  return { success: true, tables: rows.map(r => r.name) };
}

export function listColumns(dbPath, tableName) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    return { success: false, error: 'Invalid table name' };
  }
  if (isHiddenTable(tableName)) {
    return { success: false, error: hiddenTableError(isHiddenTable(tableName) ? tableName : '_cf_*') };
  }
  const db = getConsoleDb(dbPath);
  const exists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`
  ).get(tableName);
  if (!exists) return { success: false, error: 'Table not found' };

  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return {
    success: true,
    columns: rows.map(r => ({
      name: r.name,
      type: r.type,
      nullable: !r.notnull,
      default: r.dflt_value
    }))
  };
}

export function getSavedQueries() {
  const queries = readSavedQueries();
  const grouped = {};
  for (const q of queries) {
    const cat = q.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(q);
  }
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
  }
  return { success: true, queries: grouped };
}

export function saveQuery({ name, description, query, category }) {
  if (!name?.trim() || !query?.trim()) {
    return { success: false, error: 'Name and query are required' };
  }
  const queries = readSavedQueries();
  const id = queries.length ? Math.max(...queries.map(q => q.id)) + 1 : 1;
  const entry = {
    id,
    name: name.trim(),
    description: (description || '').trim(),
    query: query.trim(),
    category: (category || 'General').trim(),
    created_at: new Date().toISOString()
  };
  queries.push(entry);
  writeSavedQueries(queries);
  return { success: true, message: 'Query saved successfully', query_id: id };
}

export function updateSavedQuery(id, { name, description, query, category }) {
  const queries = readSavedQueries();
  const idx = queries.findIndex(q => q.id === id);
  if (idx === -1) return { success: false, error: 'Query not found' };
  if (name?.trim()) queries[idx].name = name.trim();
  if (description !== undefined) queries[idx].description = String(description).trim();
  if (query?.trim()) queries[idx].query = query.trim();
  if (category?.trim()) queries[idx].category = category.trim();
  writeSavedQueries(queries);
  return { success: true, message: 'Query updated successfully' };
}

export function deleteSavedQuery(id) {
  const queries = readSavedQueries();
  const next = queries.filter(q => q.id !== id);
  if (next.length === queries.length) return { success: false, error: 'Query not found' };
  writeSavedQueries(next);
  return { success: true, message: 'Query deleted successfully' };
}
