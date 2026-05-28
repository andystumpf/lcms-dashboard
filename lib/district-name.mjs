/** Normalize district names so church records and district records join reliably. */
export function normDistrictName(name) {
  return (name || '')
    .replace(/\s*District$/i, '')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}
