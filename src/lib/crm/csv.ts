const FORMULA_START = /^[-=+@\t\r]/;

/** One CSV cell, quoted, inner quotes doubled. A value a spreadsheet would run as a formula gets a leading '. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}
