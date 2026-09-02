import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { applyQueueAction, createQueueSnapshot, parseQueueDefinition, queueFilter, queueMetrics, queueProject, readQueueSnapshot } from "@/lib/service-queues";

beforeEach(async () => { await db.workspace.deleteMany({ where: { slug: { startsWith: "queue-test-" } } }); });
afterAll(() => db.$disconnect());
async function fixture() {
  const workspace = await db.workspace.create({ data: { name: "Queue test", slug: `queue-test-${randomUUID()}` } });
  const user = await db.user.create({ data: { name: "Agent", email: `${randomUUID()}@queue.test`, memberships: { create: { workspaceId: workspace.id, role: "OWNER" } } } });
  const reporter = await db.user.create({ data: { name: "Reporter", email: `${randomUUID()}@queue.test` } });
  const project = await db.project.create({ data: { workspaceId: workspace.id, name: "Support", key: "HELP", template: "SERVICE", members: { create: { userId: user.id, role: "ADMIN" } }, issueTypes: { create: { name: "Request", kind: "TASK", position: 0 } }, statuses: { create: { name: "Open", category: "TODO", color: "#888", position: 0 } } }, include: { statuses: true, issueTypes: true } });
  const type = await db.serviceRequestType.create({ data: { projectId: project.id, issueTypeId: project.issueTypes[0].id, initialStatusId: project.statuses[0].id, name: "Help", draftSchema: {}, publishedAt: new Date(), currentVersion: 1 } });
  const version = await db.serviceRequestTypeVersion.create({ data: { requestTypeId: type.id, version: 1, name: "Help", schema: {}, publishedById: user.id } });
  const queue = await db.serviceQueue.create({ data: { projectId: project.id, ownerId: user.id, name: "All", visibility: "TEAM", definition: parseQueueDefinition({}) as never } });
  const context: AuthContext = { user, workspace, role: "OWNER" };
  async function request(number: number) {
    const issue = await db.issue.create({ data: { workspaceId: workspace.id, projectId: project.id, reporterId: reporter.id, issueTypeId: project.issueTypes[0].id, statusId: project.statuses[0].id, number, rank: String(number), summary: `Request ${number}` } });
    await db.serviceRequest.create({ data: { workspaceId: workspace.id, projectId: project.id, issueId: issue.id, requestTypeId: type.id, requestTypeVersionId: version.id, submittedValues: {}, renderedSchema: {} } });
    return issue;
  }
  return { workspace, user, project, queue, context, request, type, version };
}

describe("service queue snapshots and triage", () => {
  it("rejects raw filter injection, unknown columns, invalid dates and cross-project references", async () => {
    expect(() => parseQueueDefinition({ filters: { OR: [] } })).toThrow();
    expect(() => parseQueueDefinition({ columns: ["passwordHash"] })).toThrow();
    expect(() => parseQueueDefinition({ filters: { from: "2026-02-30" } })).toThrow();
    const own = await fixture(), foreign = await fixture();
    await expect(queueFilter(own.context, own.project.id, parseQueueDefinition({ filters: { status: foreign.project.statuses[0].id } }))).rejects.toThrow(/unavailable/);
    await expect(createQueueSnapshot(own.context, "HELP", foreign.queue.id)).rejects.toMatchObject({ status: 404 });
  });
  it("keeps counts/order frozen across pages and excludes hidden and foreign requests", async () => {
    const f = await fixture(), foreign = await fixture();
    await f.request(1); const hidden = await f.request(2); await foreign.request(1);
    const security = await db.issueSecurityLevel.create({ data: { projectId: f.project.id, name: "Hidden", grants: { userIds: ["unrelated"] } } });
    await db.issue.update({ where: { id: hidden.id }, data: { securityLevelId: security.id } });
    const snapshot = await createQueueSnapshot(f.context, "HELP", f.queue.id);
    await f.request(3);
    const result = await readQueueSnapshot(f.context, "HELP", f.queue.id, snapshot.id);
    expect(result.rows.map(row => row.number)).toEqual([1]);
    expect(queueMetrics(result.rows, result.snapshot.createdAt.getTime()).total).toBe(1);
    await db.issue.update({ where: { id: result.rows[0].id }, data: { securityLevelId: security.id } });
    await expect(readQueueSnapshot(f.context, "HELP", f.queue.id, snapshot.id)).rejects.toMatchObject({ status: 409 });
  });
  it("rejects workspace viewers and project viewers even with scheme grants", async () => {
    const f = await fixture();
    await expect(queueProject({ ...f.context, role: "VIEWER" }, "HELP")).rejects.toMatchObject({ status: 404 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: f.project.id, userId: f.user.id } }, data: { role: "VIEWER" } });
    await expect(queueProject(f.context, "HELP")).rejects.toMatchObject({ status: 404 });
  });
  it("rechecks permission schemes before reading snapshots or applying actions", async () => {
    const f = await fixture(), issue = await f.request(1);
    const snapshot = await createQueueSnapshot(f.context, "HELP", f.queue.id);
    const scheme = await db.permissionScheme.create({ data: { workspaceId: f.workspace.id, name: "Restricted", versions: { create: { version: 1, createdById: f.user.id, permissions: { "issue.view": ["WORKSPACE:OWNER"], "issue.edit": [] } } } }, include: { versions: true } });
    await db.project.update({ where: { id: f.project.id }, data: { permissionSchemeVersionId: scheme.versions[0].id } });
    await expect(applyQueueAction(f.context, "HELP", f.queue.id, snapshot.id, [issue.id], { claim: true })).rejects.toMatchObject({ status: 404 });
    await db.permissionSchemeVersion.update({ where: { id: scheme.versions[0].id }, data: { permissions: {} } });
    await expect(readQueueSnapshot(f.context, "HELP", f.queue.id, snapshot.id)).rejects.toMatchObject({ status: 404 });
  });
  it("combines filters without weakening scope and uses stable priority ordering", async () => {
    const f = await fixture(), first = await f.request(1), second = await f.request(2);
    await db.issue.update({ where: { id: first.id }, data: { priority: "LOW" } });
    await db.issue.update({ where: { id: second.id }, data: { priority: "URGENT" } });
    await db.serviceRequest.update({ where: { issueId: second.id }, data: { slaState: "AT_RISK" } });
    await db.serviceQueue.update({ where: { id: f.queue.id }, data: { definition: parseQueueDefinition({ filters: { requestType: f.type.id, assignee: "unassigned", status: f.project.statuses[0].id }, sort: "priority" }) as never } });
    const snapshot = await createQueueSnapshot(f.context, "HELP", f.queue.id), result = await readQueueSnapshot(f.context, "HELP", f.queue.id, snapshot.id);
    expect(result.rows.map(row => row.id)).toEqual([second.id, first.id]);
    expect(queueMetrics(result.rows, result.snapshot.createdAt.getTime())).toMatchObject({ total: 2, unassigned: 2, slaRisk: 1 });
    const filtered = await queueFilter(f.context, f.project.id, parseQueueDefinition({ filters: { priority: "URGENT", slaState: "AT_RISK" } }));
    expect((await db.issue.findMany({ where: filtered })).map(row => row.id)).toEqual([second.id]);
  });
  it("allows exactly one concurrent claim and returns a conflict for the loser", async () => {
    const f = await fixture(), issue = await f.request(1);
    const a = await createQueueSnapshot(f.context, "HELP", f.queue.id), b = await createQueueSnapshot(f.context, "HELP", f.queue.id);
    const results = await Promise.allSettled([a, b].map(snapshot => applyQueueAction(f.context, "HELP", f.queue.id, snapshot.id, [issue.id], { claim: true })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason.status).toBe(409);
    expect((await db.issue.findUniqueOrThrow({ where: { id: issue.id } })).assigneeId).toBe(f.user.id);
    expect(await db.realtimeEvent.count({ where: { workspaceId: f.workspace.id, resourceId: issue.id, type: "issue.updated" } })).toBe(1);
  });
  it("rejects stale assignments and rolls back a bulk operation on a later conflict", async () => {
    const f = await fixture(), first = await f.request(1), second = await f.request(2);
    await db.issue.update({ where: { id: second.id }, data: { assigneeId: f.user.id } });
    const snapshot = await createQueueSnapshot(f.context, "HELP", f.queue.id);
    await expect(applyQueueAction(f.context, "HELP", f.queue.id, snapshot.id, [first.id, second.id], { claim: true })).rejects.toMatchObject({ status: 409 });
    expect((await db.issue.findUniqueOrThrow({ where: { id: first.id } })).assigneeId).toBeNull();
    await db.issue.update({ where: { id: first.id }, data: { version: { increment: 1 } } });
    await expect(applyQueueAction(f.context, "HELP", f.queue.id, snapshot.id, [first.id], { assigneeId: f.user.id })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects cross-tenant participants and preserves submission history when reclassifying", async () => {
    const f = await fixture(), issue = await f.request(1), foreign = await fixture();
    const type = await db.serviceRequestType.create({ data: { projectId: f.project.id, issueTypeId: f.project.issueTypes[0].id, initialStatusId: f.project.statuses[0].id, name: "Other", draftSchema: {}, publishedAt: new Date(), currentVersion: 1 } });
    const snapshot = await createQueueSnapshot(f.context, "HELP", f.queue.id);
    await expect(applyQueueAction(f.context, "HELP", f.queue.id, snapshot.id, [issue.id], { participantIds: [foreign.user.id] })).rejects.toThrow(/Participants/);
    await applyQueueAction(f.context, "HELP", f.queue.id, snapshot.id, [issue.id], { requestTypeId: type.id, priority: "HIGH" });
    const request = await db.serviceRequest.findUniqueOrThrow({ where: { issueId: issue.id } });
    expect(request.requestTypeId).toBe(type.id); expect(request.requestTypeVersionId).toBe(f.version.id);
  });
  it("invalidates expired snapshots and prevents another agent from using a personal snapshot", async () => {
    const f = await fixture(); await f.request(1);
    const snapshot = await createQueueSnapshot(f.context, "HELP", f.queue.id);
    await expect(readQueueSnapshot({ ...f.context, user: { ...f.user, id: "other" } }, "HELP", f.queue.id, snapshot.id)).rejects.toMatchObject({ status: 409 });
    await db.serviceQueueSnapshot.update({ where: { id: snapshot.id }, data: { expiresAt: new Date(0) } });
    await expect(readQueueSnapshot(f.context, "HELP", f.queue.id, snapshot.id)).rejects.toMatchObject({ status: 409 });
  });
});
