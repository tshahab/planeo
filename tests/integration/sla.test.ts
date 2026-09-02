import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { enqueueSlaSignal } from "@/lib/sla-signals";
import { validateSlaGoal, slaSummary } from "@/lib/sla";
import { validateCalendar, validateRules } from "../../ops/sla-engine.mjs";
import { processSlaRequest } from "../../ops/sla-worker.mjs";
beforeEach(async () => { await db.workspace.deleteMany({ where: { slug: { startsWith: "sla-test-" } } }); });
afterAll(() => db.$disconnect());
async function fixture() {
  const workspace = await db.workspace.create({ data: { name: "SLA", slug: `sla-test-${randomUUID()}` } });
  const user = await db.user.create({ data: { name: "Agent", email: `${randomUUID()}@sla.test` } });
  const project = await db.project.create({ data: { workspaceId: workspace.id, name: "Support", key: "SLA", template: "SERVICE", issueTypes: { create: { name: "Request", kind: "TASK", position: 0 } }, statuses: { create: { name: "Open", category: "TODO", color: "#888", position: 0 } } }, include: { statuses: true, issueTypes: true } });
  const requestType = await db.serviceRequestType.create({ data: { projectId: project.id, issueTypeId: project.issueTypes[0].id, initialStatusId: project.statuses[0].id, name: "Help", draftSchema: {} } });
  const version = await db.serviceRequestTypeVersion.create({ data: { requestTypeId: requestType.id, version: 1, name: "Help", schema: {}, publishedById: user.id } });
  const issue = await db.issue.create({ data: { workspaceId: workspace.id, projectId: project.id, reporterId: user.id, issueTypeId: project.issueTypes[0].id, statusId: project.statuses[0].id, number: 1, summary: "Test", rank: "a" } });
  const request = await db.serviceRequest.create({ data: { workspaceId: workspace.id, projectId: project.id, issueId: issue.id, requestTypeId: requestType.id, requestTypeVersionId: version.id, renderedSchema: {}, submittedValues: {} } });
  const calendar = await db.slaCalendar.create({ data: { projectId: project.id, name: "Always", versions: { create: { version: 1, createdById: user.id, config: validateCalendar({ timezone: "UTC", week: Array.from({ length: 7 }, () => [[0, 1440]]) }) as never } } }, include: { versions: true } });
  const goal = await db.slaGoal.create({ data: { projectId: project.id, name: "Internal goal details", metric: "RESOLUTION", versions: { create: { version: 1, calendarVersionId: calendar.versions[0].id, targetMinutes: 60, riskMinutes: 10, conditions: [], rules: validateRules({ pause: [{ id: "customer", when: [{ field: "priority", equals: "LOW" }] }, { id: "approval", when: [{ field: "statusCategory", equals: "IN_PROGRESS" }] }] }, "RESOLUTION") as never, publicLabel: "Resolution target", portalVisible: true, createdById: user.id } } }, include: { versions: true } });
  async function signal(hour: number, event: string, patch = {}) { return db.slaSignal.create({ data: { requestId: request.id, eventKey: randomUUID(), happenedAt: new Date(Date.UTC(2026, 8, 2, hour)), goalIds: [goal.versions[0].id], payload: { event, statusCategory: "TODO", priority: "HIGH", ...patch } } }); }
  return { workspace, user, project, issue, request, calendar, goal, signal };
}
describe("durable SLA cycles", () => {
  it("recovers delayed breach times and idempotent history after restart", async () => {
    const f = await fixture(); await f.signal(0, "issue.created");
    await processSlaRequest(db, f.request.id, new Date("2026-09-02T03:00:00Z"));
    await processSlaRequest(db, f.request.id, new Date("2026-09-02T03:00:00Z"));
    const cycle = await db.slaCycle.findFirstOrThrow({ where: { requestId: f.request.id }, include: { events: true } });
    expect(cycle.breachedAt?.toISOString()).toBe("2026-09-02T01:00:00.000Z");
    expect(cycle.riskAt?.toISOString()).toBe("2026-09-02T00:50:00.000Z");
    expect(cycle.events.filter(event => event.type === "sla.breached")).toHaveLength(1);
    expect((await slaSummary(f.request.id, true))[0]).toMatchObject({ label: "Resolution target", state: "Overdue" });
    expect(JSON.stringify(await slaSummary(f.request.id, true))).not.toContain("Internal goal details");
  });
  it("keeps overlapping pause reasons until all clear, and preserves old versions", async () => {
    const f = await fixture(); await f.signal(0, "issue.created", { priority: "LOW", statusCategory: "IN_PROGRESS" });
    await f.signal(1, "issue.updated", { priority: "HIGH", statusCategory: "IN_PROGRESS" });
    await f.signal(2, "issue.updated");
    await processSlaRequest(db, f.request.id, new Date("2026-09-02T02:30:00Z"));
    const cycle = await db.slaCycle.findFirstOrThrow({ where: { requestId: f.request.id } });
    expect(cycle.elapsedMs).toBe(1800000n); expect(cycle.pauseReasons).toEqual([]);
    await expect(db.slaCalendarVersion.update({ where: { id: f.calendar.versions[0].id }, data: { config: {} } })).rejects.toThrow(/immutable/);
    const changed = await db.slaCalendarVersion.create({ data: { calendarId: f.calendar.id, version: 2, config: validateCalendar({ timezone: "UTC", week: Array.from({ length: 7 }, () => [[600, 660]]) }) as never, createdById: f.user.id } });
    expect(changed.id).not.toBe(f.calendar.versions[0].id);
    await processSlaRequest(db, f.request.id, new Date("2026-09-02T03:00:00Z"));
    expect((await db.slaCycle.findUniqueOrThrow({ where: { id: cycle.id } })).breachedAt?.toISOString()).toBe("2026-09-02T03:00:00.000Z");
  });
  it("records success and starts a new cycle when the request reopens", async () => {
    const f = await fixture(); await f.signal(0, "issue.created");
    await db.slaSignal.create({ data: { requestId: f.request.id, eventKey: randomUUID(), happenedAt: new Date("2026-09-02T00:30:00Z"), goalIds: [f.goal.versions[0].id], payload: { event: "issue.transitioned", statusCategory: "DONE", priority: "HIGH" } } });
    await f.signal(1, "request.reopened");
    await processSlaRequest(db, f.request.id, new Date("2026-09-02T01:15:00Z"));
    const cycles = await db.slaCycle.findMany({ where: { requestId: f.request.id }, orderBy: { sequence: "asc" } });
    expect(cycles).toHaveLength(2); expect(cycles[0].state).toBe("MET"); expect(cycles[1].elapsedMs).toBe(900000n);
  });
  it("captures only matching prioritized versions and rejects foreign calendars", async () => {
    const f = await fixture(), foreign = await fixture();
    await expect(db.$transaction(tx => validateSlaGoal(tx, f.project.id, f.workspace.id, { targetMinutes: 60, riskMinutes: 10, calendarVersionId: foreign.calendar.versions[0].id }, "RESOLUTION"))).rejects.toThrow(/project/);
    await db.$transaction(tx => enqueueSlaSignal(tx, { issueId: f.issue.id, event: "issue.created", eventKey: "same-source" }));
    await db.$transaction(tx => enqueueSlaSignal(tx, { issueId: f.issue.id, event: "issue.created", eventKey: "same-source" }));
    expect(await db.slaSignal.count({ where: { requestId: f.request.id } })).toBe(1);
    expect((await db.slaSignal.findFirstOrThrow({ where: { requestId: f.request.id } })).goalIds).toEqual([f.goal.versions[0].id]);
  });
  it("captures raw API/worker writes at commit and selects the first matching goal", async () => {
    const f = await fixture();
    await db.slaGoal.update({ where: { id: f.goal.id }, data: { position: 10 } });
    const first = await db.slaGoal.create({ data: { projectId: f.project.id, name: "Urgent first", metric: "RESOLUTION", position: 0, versions: { create: { version: 1, calendarVersionId: f.calendar.versions[0].id, targetMinutes: 10, riskMinutes: 1, conditions: [{ field: "priority", equals: "URGENT" }], rules: validateRules({}, "RESOLUTION") as never, publicLabel: "Urgent target", createdById: f.user.id } } }, include: { versions: true } });
    await db.$transaction(async tx => { await tx.issue.update({ where: { id: f.issue.id }, data: { priority: "LOW", version: { increment: 1 } } }); await tx.issue.update({ where: { id: f.issue.id }, data: { priority: "URGENT", version: { increment: 1 } } }); });
    const signals = await db.slaSignal.findMany({ where: { requestId: f.request.id } });
    expect(signals.length).toBeGreaterThan(0); expect(signals.every(signal => (signal.payload as { priority: string }).priority === "URGENT")).toBe(true);
    await processSlaRequest(db, f.request.id, new Date(Date.now() + 1000));
    expect((await db.slaCycle.findFirstOrThrow({ where: { requestId: f.request.id } })).goalVersionId).toBe(first.versions[0].id);
  });
});
