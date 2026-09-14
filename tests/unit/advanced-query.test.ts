import { describe, expect, it } from "vitest";
import { compileAdvancedQuery, parseAdvancedQuery, QueryLanguageError } from "@/lib/advanced-query";

describe("advanced query language", () => {
  it("parses boolean groups, membership, and relative dates", () => {
    const result = compileAdvancedQuery('project = WEB AND (priority IN (HIGH, URGENT) OR updated >= -7d)', new Date("2026-09-14T12:00:00Z"));
    expect(result.version).toBe(1); expect(result.cost).toBeGreaterThan(0); expect(result.where).toHaveProperty("AND");
  });
  it("produces actionable errors without exposing schema", () => {
    expect(() => parseAdvancedQuery("secretField = value")).toThrow(QueryLanguageError);
    try { parseAdvancedQuery("project ="); } catch (error) { expect(error).toMatchObject({ offset: 9, code: "INVALID_QUERY" }); expect(String(error)).not.toContain("Prisma"); }
  });
  it("rejects excessive cost predictably", () => {
    const query = Array.from({ length: 22 }, (_, index) => `text ~ "term${index}"`).join(" OR ");
    expect(() => parseAdvancedQuery(query)).toThrowError(/cost .* exceeds limit/);
  });
  it("never embeds executable database fragments", () => {
    const result = compileAdvancedQuery('summary ~ "x\' OR 1=1 --"');
    expect(JSON.stringify(result.where)).toContain("x' OR 1=1 --");
  });
});
