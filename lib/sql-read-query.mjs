// Shared SQL-console guards: read-only detection and result size cap.

export const MAX_SQL_ROWS = 2000;

const WRITE_KEYWORD = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|VACUUM|REINDEX)\b/i;

export function stripSqlComments(query) {
  return String(query || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

function stripSqlStrings(sql) {
  return sql.replace(/'(?:''|[^'])*'/g, "''");
}

/** True when the statement is a single read-only query. */
export function isReadQuery(query) {
  const trimmed = stripSqlComments(query).trim().replace(/;\s*$/, '');
  if (!trimmed) return false;
  if (/;/.test(trimmed)) return false;
  if (WRITE_KEYWORD.test(stripSqlStrings(trimmed))) return false;
  const first = trimmed.split(/\s+/)[0]?.toUpperCase() ?? '';
  return ['SELECT', 'WITH', 'PRAGMA', 'EXPLAIN'].includes(first);
}

export function truncateRows(rows, max = MAX_SQL_ROWS) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length <= max) {
    return { rows: list, truncated: false, row_count: list.length };
  }
  return { rows: list.slice(0, max), truncated: true, row_count: max };
}
