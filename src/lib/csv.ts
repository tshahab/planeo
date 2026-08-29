export const ISSUE_CSV_COLUMNS = ["externalId", "summary", "description", "type", "status", "priority", "assigneeEmail", "labels", "estimate", "dueDate", "parentExternalId", "links", "releases", "customFields"] as const;
export type IssueCsvRow = Record<typeof ISSUE_CSV_COLUMNS[number], string>;

export function parseCsv(input: string, maxRows = 5000): { rows: IssueCsvRow[]; errors: { row: number; field: string; message: string }[] } {
  const records: string[][] = []; let record: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < input.length; index++) { const character = input[index]; if (quoted) { if (character === '"' && input[index + 1] === '"') { field += '"'; index++; } else if (character === '"') quoted = false; else field += character; } else if (character === '"' && field === "") quoted = true; else if (character === ",") { record.push(field); field = ""; } else if (character === "\n") { record.push(field.replace(/\r$/, "")); records.push(record); record = []; field = ""; } else field += character; }
  if (quoted) return { rows: [], errors: [{ row: Math.max(1, records.length + 1), field: "csv", message: "Unterminated quoted field." }] };
  if (field || record.length) { record.push(field.replace(/\r$/, "")); records.push(record); }
  const header = records.shift() ?? []; const errors: { row: number; field: string; message: string }[] = [];
  if (header.join("\0") !== ISSUE_CSV_COLUMNS.join("\0")) errors.push({ row: 1, field: "header", message: `Expected columns: ${ISSUE_CSV_COLUMNS.join(",")}` });
  if (records.length > maxRows) errors.push({ row: maxRows + 2, field: "csv", message: `CSV exceeds the ${maxRows}-row limit.` });
  const rows = records.slice(0, maxRows).filter((values) => values.some(Boolean)).map((values, index) => { if (values.length < ISSUE_CSV_COLUMNS.length - 1 || values.length > ISSUE_CSV_COLUMNS.length) errors.push({ row: index + 2, field: "csv", message: `Expected ${ISSUE_CSV_COLUMNS.length} fields, received ${values.length}.` }); return Object.fromEntries(ISSUE_CSV_COLUMNS.map((column, columnIndex) => [column, values[columnIndex] ?? ""])) as IssueCsvRow; });
  return { rows, errors };
}

export function csvCell(value: unknown) { const text = value == null ? "" : String(value); const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replace(/"/g, '""')}"`; }
export function encodeCsv(rows: Record<string, unknown>[]) { return [ISSUE_CSV_COLUMNS.join(","), ...rows.map((row) => ISSUE_CSV_COLUMNS.map((column) => csvCell(row[column])).join(","))].join("\r\n") + "\r\n"; }
