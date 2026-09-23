import { describe, expect, it } from "vitest";
import { goalInput, manualGoalProgress } from "@/lib/goals";

describe("organizational goals", () => {
  it("calculates deterministic bounded manual progress", () => {
    expect(manualGoalProgress(1, 3)).toBe(33);
    expect(manualGoalProgress(150, 100)).toBe(100);
  });

  it("validates periods and preserves explicit privacy", () => {
    expect(goalInput({ name: "Retention", visibility: "PRIVATE", progressMethod: "WORK", periodStart: "2026-09-01", periodEnd: "2026-12-31" })).toMatchObject({ name: "Retention", visibility: "PRIVATE", progressMethod: "WORK" });
    expect(() => goalInput({ name: "Invalid", periodStart: "2026-12-31", periodEnd: "2026-09-01" })).toThrow(/period/i);
  });
});
