import { describe, expect, it } from "vitest";
import { calculatePortfolioHealth } from "@/lib/portfolio-health";

describe("portfolio health", () => {
  it("calculates deterministic progress, schedule risk, and forecast ranges", () => {
    const result = calculatePortfolioHealth([
      { id: "done", dueDate: "2025-12-01", completedAt: "2025-12-02", estimate: 8 },
      { id: "late", dueDate: "2025-12-31", completedAt: null, estimate: 3 },
      { id: "open", dueDate: "2026-01-10", completedAt: null, estimate: 5 },
      { id: "unknown", dueDate: null, completedAt: null, estimate: null },
    ], new Date("2026-01-01T12:00:00Z"));
    expect(result.progress).toEqual({ completed: 1, completionRate: 25, remaining: 3 });
    expect(result.schedule).toMatchObject({ overdue: 1, unscheduled: 1, confidence: "LOW" });
    expect(result.forecast).toMatchObject({ remainingPoints: 8, lowDays: 1, highDays: 5 });
    expect(result.rules.timezone).toBe("UTC");
  });

  it("returns a stable empty report", () => {
    const result = calculatePortfolioHealth([]);
    expect(result.progress).toEqual({ completed: 0, completionRate: 0, remaining: 0 });
    expect(result.forecast).toMatchObject({ remainingPoints: 0, lowDays: 0, highDays: 0 });
    expect(result.schedule.confidence).toBe("LOW");
  });
});
