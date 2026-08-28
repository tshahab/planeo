import { describe, expect, it, vi } from "vitest";
import { releaseDates, releaseView } from "../../src/lib/releases";

describe("release planning", () => {
  it("validates ordered calendar dates", () => { expect(releaseDates({ startsAt: "2026-09-02", releaseDate: "2026-09-01" })).toHaveProperty("error"); expect(releaseDates({ startsAt: "2026-09-01", releaseDate: "2026-09-02" })).toMatchObject({ startsAt: expect.any(Date), releaseDate: expect.any(Date) }); });
  it("summarizes readiness without mutating issue state", () => { vi.setSystemTime(new Date("2026-09-03T00:00:00Z")); const view = releaseView({ id: "r1", releaseDate: new Date("2026-09-02T00:00:00Z"), issues: [{ issue: { estimate: 3, archivedAt: null, dueDate: null, status: { category: "DONE" } } }, { issue: { estimate: 5, archivedAt: null, dueDate: null, status: { category: "TODO" } } }] }); expect(view).toMatchObject({ issueCount: 2, completedCount: 1, unresolvedCount: 1, completionPercent: 50, totalEstimate: 8, completedEstimate: 3, overdue: true }); vi.useRealTimers(); });
});
