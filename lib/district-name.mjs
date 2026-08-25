/** Normalize district names so church records and district records join reliably. */
export function normDistrictName(name) {
  return (name || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .trim()
    .replace(/\s*District$/i, '')
    .trim();
}
