const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

/**
 * Quoting is not enough for spreadsheet applications: a quoted `=...` cell can
 * still execute as a formula. Prefixing an apostrophe preserves visible text and
 * forces a literal cell.
 */
export function csvCell(value: string | number | null): string {
  const raw = value === null ? "" : String(value);
  const text = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}
