import { describe, expect, it } from "vitest";
import { scenarioIssueUpdate } from "@/lib/planning-scenarios";

describe("planning scenario patches", () => {
  it("maps only proposed live fields and always increments the source version", () => {
    expect(scenarioIssueUpdate({ dueDate: "2026-10-15T00:00:00.000Z", estimate: 8 })).toEqual({ dueDate: new Date("2026-10-15T00:00:00.000Z"), estimate: 8, version: { increment: 1 } });
    expect(scenarioIssueUpdate({ assigneeId: null })).toEqual({ assigneeId: null, version: { increment: 1 } });
  });
});
