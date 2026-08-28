import { describe, expect, it } from "vitest";
import { encodeCsv, ISSUE_CSV_COLUMNS, parseCsv } from "../../src/lib/csv";

describe("issue CSV", () => {
  it("parses UTF-8 quoted delimiters and empty optional fields", () => { const csv = `${ISSUE_CSV_COLUMNS.join(",")}\n1,"Résumé, launch",,"Task","To Do",HIGH,,,,,,`; const result = parseCsv(csv); expect(result.errors).toEqual([]); expect(result.rows[0].summary).toBe("Résumé, launch"); expect(result.rows[0].assigneeEmail).toBe(""); });
  it("reports malformed rows without hiding them", () => { const result = parseCsv(`${ISSUE_CSV_COLUMNS.join(",")}\n1,too,few`); expect(result.errors[0]).toMatchObject({ row: 2, field: "csv" }); });
  it("neutralizes spreadsheet formulas in exports", () => { const csv = encodeCsv([{ externalId: "=CMD()", summary: "+SUM(1,2)" }]); expect(csv).toContain("'=CMD()"); expect(csv).toContain("'+SUM(1,2)"); });
});
