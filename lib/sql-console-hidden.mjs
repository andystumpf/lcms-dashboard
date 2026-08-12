// Tables hidden from the SQL console sidebar and blocked from ad-hoc queries.

const HIDDEN = new Set(['build_meta', 'synod_summary']);

export function isHiddenTable(name) {
  if (!name) return false;
  if (HIDDEN.has(name)) return true;
  return /^_cf_/i.test(name);
}

export function referencesHiddenTable(query) {
  if (/\bbuild_meta\b/i.test(query)) return 'build_meta';
  if (/\bsynod_summary\b/i.test(query)) return 'synod_summary';
  if (/\b_cf_[a-z0-9_]+\b/i.test(query)) return '_cf_*';
  return null;
}

export function hiddenTableError(tableRef) {
  if (tableRef === 'build_meta') {
    return 'Internal metadata table (build_meta) is not available in the SQL console';
  }
  if (tableRef === 'synod_summary') {
    return 'Internal summary table (synod_summary) is not available in the SQL console';
  }
  return 'D1 internal system tables (_cf_*) cannot be queried';
}

export const LIST_TABLES_FILTER = `
  AND name NOT IN ('build_meta', 'synod_summary')
  AND name NOT LIKE '_cf_%'
`;
