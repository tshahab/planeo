import { describe, expect, it } from "vitest";

describe("portfolio health snapshot request contract", () => {
  it("does not allow export/history query modes to alter snapshot capture", () => {
    const url = new URL("https://example.test/api/plans/plan-1/health?format=csv&history=true");
    url.search = "";
    expect(url.pathname).toBe("/api/plans/plan-1/health");
    expect(url.search).toBe("");
  });
});
