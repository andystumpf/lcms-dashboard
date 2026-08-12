// SQL console backend for D1 — read-only queries and schema browsing.

import {
  isHiddenTable,
  referencesHiddenTable,
  hiddenTableError,
  LIST_TABLES_FILTER
} from './sql-console-hidden.mjs';

function isReadQuery(query) {
  const trimmed = query.trim().replace(/^\/\*[\s\S]*?\*\//, '').trim().replace(/;\s*$/, '');
  if (/;/.test(trimmed)) return false;
  const first = trimmed.split(/\s+/)[0]?.toUpperCase() ?? '';
  return ['SELECT', 'WITH', 'PRAGMA', 'EXPLAIN'].includes(first);
}

function groupSavedQueries(queries) {
  const grouped = {};
  for (const q of queries) {
    const cat = q.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(q);
  }
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
  }
  return grouped;
}

export async function executeSql(db, query) {
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

  const start = Date.now();
  try {
    const { results, meta } = await db.prepare(trimmed).all();
    const rows = results ?? [];
    const columns = rows.length
      ? Object.keys(rows[0])
      : (meta?.columns?.map(c => c.name) ?? []);
    return {
      success: true,
      type: 'SELECT',
      columns,
      results: rows,
      row_count: rows.length,
      execution_time: Date.now() - start,
      message: `Query executed successfully. ${rows.length} rows returned.`
    };
  } catch (err) {
    return { success: false, error: err.message, message: err.message };
  }
}

export function runTransaction() {
  return { success: false, error: 'Transactions are disabled (read-only mode)' };
}

export async function listTables(db) {
  const { results } = await db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      ${LIST_TABLES_FILTER}
    ORDER BY name
  `).all();
  return { success: true, tables: (results ?? []).map(r => r.name) };
}

export async function listColumns(db, tableName) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    return { success: false, error: 'Invalid table name' };
  }
  if (isHiddenTable(tableName)) {
    return { success: false, error: hiddenTableError(isHiddenTable(tableName) ? tableName : '_cf_*') };
  }
  const exists = await db.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`
  ).bind(tableName).first();
  if (!exists) return { success: false, error: 'Table not found' };

  const { results } = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  return {
    success: true,
    columns: (results ?? []).map(r => ({
      name: r.name,
      type: r.type,
      nullable: !r.notnull,
      default: r.dflt_value
    }))
  };
}

export async function getSavedQueries(kv, defaults) {
  let queries = defaults;
  if (kv) {
    const stored = await kv.get('queries', 'json');
    if (stored) queries = stored;
  }
  return { success: true, queries: groupSavedQueries(queries) };
}

async function readSavedQueries(kv, defaults) {
  if (!kv) return [...defaults];
  const stored = await kv.get('queries', 'json');
  return stored ?? [...defaults];
}

async function writeSavedQueries(kv, queries) {
  if (!kv) {
    return { success: false, error: 'Saved queries are read-only in this environment' };
  }
  await kv.put('queries', JSON.stringify(queries));
  return null;
}

export async function saveQuery(kv, defaults, { name, description, query, category }) {
  if (!name?.trim() || !query?.trim()) {
    return { success: false, error: 'Name and query are required' };
  }
  const queries = await readSavedQueries(kv, defaults);
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
  const err = await writeSavedQueries(kv, queries);
  if (err) return err;
  return { success: true, message: 'Query saved successfully', query_id: id };
}

export async function updateSavedQuery(kv, defaults, id, { name, description, query, category }) {
  const queries = await readSavedQueries(kv, defaults);
  const idx = queries.findIndex(q => q.id === id);
  if (idx === -1) return { success: false, error: 'Query not found' };
  if (name?.trim()) queries[idx].name = name.trim();
  if (description !== undefined) queries[idx].description = String(description).trim();
  if (query?.trim()) queries[idx].query = query.trim();
  if (category?.trim()) queries[idx].category = category.trim();
  const err = await writeSavedQueries(kv, queries);
  if (err) return err;
  return { success: true, message: 'Query updated successfully' };
}

export async function deleteSavedQuery(kv, defaults, id) {
  const queries = await readSavedQueries(kv, defaults);
  const next = queries.filter(q => q.id !== id);
  if (next.length === queries.length) return { success: false, error: 'Query not found' };
  const err = await writeSavedQueries(kv, next);
  if (err) return err;
  return { success: true, message: 'Query deleted successfully' };
}
