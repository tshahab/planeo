import { Prisma, type Priority } from "@prisma/client";
import type { AuthContext } from "./auth";
import { db } from "./db";
import { accessibleProjectWhere } from "./project-query";
import { issueSecurityWhere, requireProjectPermission } from "./permissions";
import { publishRealtime } from "./realtime";
import { evaluateTransition } from "./workflow";
import { enqueueAutomation } from "./automation";
import { enqueueWebhook } from "./webhooks";
import { validateCustomFieldWrites } from "./custom-fields";
import { createIssueNotifications } from "./notifications";

export class QueueError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const QUEUE_COLUMNS = ["summary", "status", "priority", "assignee", "requestType", "organization", "createdAt", "updatedAt", "slaState", "customerResponse"] as const;
const FILTERS = ["status", "requestType", "priority", "assignee", "organization", "label", "slaState", "from", "to"] as const;
const SLA_STATES = ["NONE", "RUNNING", "PAUSED", "AT_RISK", "BREACHED", "MET"];
export type QueueDefinition = { filters: Partial<Record<typeof FILTERS[number], string>>; columns: string[]; grouping: string; sort: string; direction: "asc" | "desc" };
export type QueueRow = { id: string; requestId: string; version: number; summary: string; number: number; status: string; statusId: string; priority: string; assignee: string; assigneeId: string | null; requestType: string; organization: string; createdAt: string; updatedAt: string; slaState: string; customerResponse: string | null };

export function parseQueueDefinition(value: unknown): QueueDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QueueError("A queue definition is required.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["filters", "columns", "grouping", "sort", "direction"].includes(key))) throw new QueueError("Unsupported queue setting.");
  const filters = input.filters ?? {};
  if (!filters || typeof filters !== "object" || Array.isArray(filters) || Object.entries(filters).some(([key, item]) => !FILTERS.includes(key as never) || typeof item !== "string" || item.length > 100)) throw new QueueError("Invalid queue filters.");
  const normalized = Object.fromEntries(Object.entries(filters).filter(([, item]) => item !== "")) as QueueDefinition["filters"];
  if (normalized.priority && !["URGENT", "HIGH", "MEDIUM", "LOW"].includes(normalized.priority) || normalized.slaState && !SLA_STATES.includes(normalized.slaState)) throw new QueueError("Invalid queue filter value.");
  for (const key of ["from", "to"] as const) if (normalized[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(normalized[key]) || !Number.isFinite(Date.parse(normalized[key])) || new Date(normalized[key]).toISOString().slice(0, 10) !== normalized[key])) throw new QueueError("Invalid queue date.");
  if (normalized.from && normalized.to && normalized.from > normalized.to) throw new QueueError("Start date must precede end date.");
  const columns = input.columns ?? ["summary", "status", "priority", "assignee", "slaState"];
  if (!Array.isArray(columns) || !columns.length || columns.length > QUEUE_COLUMNS.length || new Set(columns).size !== columns.length || columns.some(key => !QUEUE_COLUMNS.includes(key as never))) throw new QueueError("Invalid queue columns.");
  const grouping = input.grouping ?? "none", sort = input.sort ?? "createdAt", direction = input.direction ?? "asc";
  if (!["none", "status", "priority", "assignee", "requestType", "organization", "slaState"].includes(String(grouping)) || !["createdAt", "updatedAt", "priority", "summary"].includes(String(sort)) || !["asc", "desc"].includes(String(direction))) throw new QueueError("Invalid queue ordering.");
  return { filters: normalized, columns: columns as string[], grouping: String(grouping), sort: String(sort), direction: direction as "asc" | "desc" };
}

export async function queueProject(context: AuthContext, key: string, edit = false) {
  const project = await db.project.findFirst({ where: { ...accessibleProjectWhere(context), key: key.toUpperCase(), template: "SERVICE" } });
  const membership = project ? await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } } }) : null;
  if (!project || context.role === "VIEWER" || membership?.role === "VIEWER" || !await requireProjectPermission(context, project.id, edit ? "issue.edit" : "issue.view")) throw new QueueError("Queue not found.", 404);
  return project;
}

export function visibleQueues(userId: string) { return { OR: [{ visibility: "TEAM" }, { ownerId: userId }] }; }

export async function queueFilter(context: AuthContext, projectId: string, definition: QueueDefinition): Promise<Prisma.IssueWhereInput> {
  const f = definition.filters;
  const security = await issueSecurityWhere(context, [projectId]);
  const checks = await Promise.all([
    f.status ? db.status.count({ where: { id: f.status, projectId } }) : 1,
    f.requestType ? db.serviceRequestType.count({ where: { id: f.requestType, projectId } }) : 1,
    f.assignee && f.assignee !== "unassigned" ? db.projectMember.count({ where: { projectId, userId: f.assignee, user: { memberships: { some: { workspaceId: context.workspace.id, deactivatedAt: null } } } } }) : 1,
    f.organization ? db.portalProjectOrganization.count({ where: { projectId, organizationId: f.organization, enabled: true, organization: { workspaceId: context.workspace.id } } }) : 1,
    f.label ? db.label.count({ where: { id: f.label, workspaceId: context.workspace.id, issues: { some: { issue: { projectId, archivedAt: null, AND: [security] } } } } }) : 1,
  ]);
  if (checks.some(count => !count)) throw new QueueError("A filter references an unavailable project value.");
  return { workspaceId: context.workspace.id, projectId, archivedAt: null, AND: [security],
    ...(f.status ? { statusId: f.status } : {}), ...(f.priority ? { priority: f.priority as Priority } : {}),
    ...(f.assignee ? { assigneeId: f.assignee === "unassigned" ? null : f.assignee } : {}),
    ...(f.label ? { labels: { some: { labelId: f.label } } } : {}),
    ...((f.from || f.to) ? { createdAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lt: new Date(Date.parse(f.to) + 86400000) } : {}) } } : {}),
    serviceRequest: { is: { workspaceId: context.workspace.id, projectId, ...(f.requestType ? { requestTypeId: f.requestType } : {}), ...(f.organization ? { customerOrganizationId: f.organization } : {}), ...(f.slaState ? { slaState: f.slaState } : {}) } },
  };
}

export async function createQueueSnapshot(context: AuthContext, key: string, queueId: string) {
  const project = await queueProject(context, key);
  const queue = await db.serviceQueue.findFirst({ where: { id: queueId, projectId: project.id, ...visibleQueues(context.user.id) } });
  if (!queue) throw new QueueError("Queue not found.", 404);
  const definition = parseQueueDefinition(queue.definition), where = await queueFilter(context, project.id, definition);
  return db.$transaction(async tx => {
    if (await tx.serviceQueueSnapshot.count({ where: { queueId, userId: context.user.id, expiresAt: { gt: new Date() } } }) >= 30) throw new QueueError("Too many active snapshots. Wait a few minutes before refreshing.", 429);
    const issues = await tx.issue.findMany({ where, take: 2001, orderBy: [{ [definition.sort]: definition.direction }, { id: "asc" }], select: { id: true, number: true, summary: true, version: true, statusId: true, priority: true, assigneeId: true, createdAt: true, updatedAt: true, status: { select: { name: true } }, assignee: { select: { name: true } }, serviceRequest: { select: { id: true, slaState: true, requestType: { select: { name: true } }, customerOrganization: { select: { name: true } }, portalComments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } } } });
    if (issues.length > 2000) throw new QueueError("Refine this queue to at most 2,000 requests before taking a snapshot.");
    const rows: QueueRow[] = issues.map(issue => ({ id: issue.id, requestId: issue.serviceRequest!.id, number: issue.number, version: issue.version, summary: issue.summary, statusId: issue.statusId, status: issue.status.name, priority: issue.priority, assigneeId: issue.assigneeId, assignee: issue.assignee?.name ?? "Unassigned", requestType: issue.serviceRequest!.requestType.name, organization: issue.serviceRequest!.customerOrganization?.name ?? "None", slaState: issue.serviceRequest!.slaState, createdAt: issue.createdAt.toISOString(), updatedAt: issue.updatedAt.toISOString(), customerResponse: issue.serviceRequest!.portalComments[0]?.createdAt.toISOString() ?? null }));
    await tx.serviceQueueSnapshot.deleteMany({ where: { queueId, userId: context.user.id, expiresAt: { lt: new Date() } } });
    return tx.serviceQueueSnapshot.create({ data: { queueId, queueVersion: queue.version, userId: context.user.id, rows: rows as unknown as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 5 * 60_000) }, select: { id: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function readQueueSnapshot(context: AuthContext, key: string, queueId: string, snapshotId: string) {
  const project = await queueProject(context, key);
  const snapshot = await db.serviceQueueSnapshot.findFirst({ where: { id: snapshotId, queueId, userId: context.user.id, expiresAt: { gt: new Date() }, queue: { projectId: project.id, ...visibleQueues(context.user.id) } }, include: { queue: true } });
  if (!snapshot) throw new QueueError("Snapshot expired or unavailable. Refresh the queue.", 409);
  const rows = snapshot.rows as unknown as QueueRow[];
  const current = await db.issue.findMany({ where: { workspaceId: context.workspace.id, projectId: project.id, archivedAt: null, id: { in: rows.map(row => row.id) }, AND: [await issueSecurityWhere(context, [project.id])] }, select: { id: true, version: true } });
  const versions = new Map(current.map(row => [row.id, row.version]));
  if (snapshot.queueVersion !== snapshot.queue.version || rows.some(row => versions.get(row.id) !== row.version)) throw new QueueError("Queue data or access changed. Refresh before continuing.", 409);
  return { snapshot, rows, project, definition: parseQueueDefinition(snapshot.queue.definition) };
}

export function queueMetrics(rows: QueueRow[], now: number) {
  const workload: Record<string, number> = Object.create(null);
  for (const row of rows) workload[row.assignee] = (workload[row.assignee] ?? 0) + 1;
  return { total: rows.length, unassigned: rows.filter(row => !row.assigneeId).length, aging: rows.filter(row => now - Date.parse(row.createdAt) > 7 * 86400000).length, slaRisk: rows.filter(row => ["AT_RISK", "BREACHED"].includes(row.slaState)).length, recentCustomerResponses: rows.filter(row => row.customerResponse && now - Date.parse(row.customerResponse) < 86400000).length, workload };
}

export async function applyQueueAction(context: AuthContext, key: string, queueId: string, snapshotId: string, ids: unknown, raw: unknown) {
  await queueProject(context, key, true);
  const { rows, project } = await readQueueSnapshot(context, key, queueId, snapshotId);
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !rows.some(row => row.id === id))) throw new QueueError("Select up to 100 requests from this snapshot.");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new QueueError("An action is required.");
  const action = raw as Record<string, unknown>;
  if (!Object.keys(action).length || Object.keys(action).some(key => !["claim", "assigneeId", "priority", "statusId", "requestTypeId", "participantIds"].includes(key))) throw new QueueError("Unsupported queue action.");
  if (action.claim !== undefined && action.claim !== true || action.claim && action.assigneeId !== undefined) throw new QueueError("Invalid claim action.");
  if (action.priority !== undefined && !["URGENT", "HIGH", "MEDIUM", "LOW"].includes(String(action.priority))) throw new QueueError("Invalid priority.");
  if (action.assigneeId !== undefined && action.assigneeId !== null && typeof action.assigneeId !== "string") throw new QueueError("Invalid assignee.");
  for (const field of ["statusId", "requestTypeId"] as const) if (action[field] !== undefined && typeof action[field] !== "string") throw new QueueError("Invalid project reference.");
  const assigneeId = action.claim ? context.user.id : action.assigneeId as string | null | undefined;
  const membership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } } });
  const security = await issueSecurityWhere(context, [project.id]);
  try { return await db.$transaction(async tx => {
    if (assigneeId && !await tx.projectMember.count({ where: { projectId: project.id, userId: assigneeId, role: { not: "VIEWER" }, user: { memberships: { some: { workspaceId: context.workspace.id, role: { not: "VIEWER" }, deactivatedAt: null } } } } })) throw new QueueError("Assignee must be an active agent in this project.");
    const status = action.statusId ? await tx.status.findFirst({ where: { id: String(action.statusId), projectId: project.id } }) : null;
    if (action.statusId !== undefined && !status) throw new QueueError("Status is not in this project.");
    const requestType = action.requestTypeId ? await tx.serviceRequestType.findFirst({ where: { id: String(action.requestTypeId), projectId: project.id, archivedAt: null, publishedAt: { not: null } } }) : null;
    if (action.requestTypeId !== undefined && !requestType) throw new QueueError("Request type is not published in this project.");
    const participantIds = action.participantIds;
    if (participantIds !== undefined) {
      if (!Array.isArray(participantIds) || participantIds.length > 50 || participantIds.some(id => typeof id !== "string") || new Set(participantIds).size !== participantIds.length) throw new QueueError("Invalid participants.");
      const count = await tx.portalCustomer.count({ where: { id: { in: participantIds as string[] }, workspaceId: context.workspace.id, verifiedAt: { not: null }, deactivatedAt: null, OR: [{ projects: { some: { projectId: project.id, enabled: true } } }, { organizations: { some: { active: true, organization: { projects: { some: { projectId: project.id, enabled: true } } } } } }] } });
      if (count !== participantIds.length) throw new QueueError("Participants must have current access to this project.");
    }
    for (const id of ids as string[]) {
      const row = rows.find(row => row.id === id)!;
      const existing = await tx.issue.findFirst({ where: { id, workspaceId: context.workspace.id, projectId: project.id, version: row.version, archivedAt: null, AND: [security] } });
      if (!existing || action.claim && existing.assigneeId) throw new QueueError("A request changed or was claimed. Refresh and retry.", 409);
      const data: Prisma.IssueUncheckedUpdateManyInput = { version: { increment: 1 }, ...(assigneeId !== undefined ? { assigneeId } : {}), ...(action.priority ? { priority: action.priority as Priority } : {}) };
      if (status && status.id !== existing.statusId) {
        const execution = await evaluateTransition(tx, { projectId: project.id, issueId: id, fromStatusId: existing.statusId, toStatusId: status.id, actorId: context.user.id, workspaceRole: context.role, projectRole: membership?.role, proposed: { ...data } });
        // Complex workflow side effects remain in the issue editor; never silently skip them.
        if (execution?.actions.length) throw new QueueError("This transition has workflow actions. Use the issue editor.");
        const column = await tx.boardColumn.findFirst({ where: { statusId: status.id, board: { projectId: project.id } } });
        if (column?.wipLimit && await tx.issue.count({ where: { projectId: project.id, statusId: status.id, archivedAt: null } }) >= column.wipLimit) throw new QueueError("The target status has reached its work-in-progress limit.");
        data.statusId = status.id; data.completedAt = status.category === "DONE" ? new Date() : null;
      }
      if (requestType && requestType.issueTypeId !== existing.issueTypeId) {
        const fields = await tx.customFieldValue.findMany({ where: { issueId: id } });
        await validateCustomFieldWrites(tx, { workspaceId: context.workspace.id, projectId: project.id, issueTypeId: requestType.issueTypeId, values: Object.fromEntries(fields.map(field => [field.fieldId, field.value])) });
        data.issueTypeId = requestType.issueTypeId;
      }
      const updated = await tx.issue.updateMany({ where: { id, version: row.version, ...(action.claim ? { assigneeId: null } : {}) }, data });
      if (updated.count !== 1) throw new QueueError("A request changed. Refresh and retry.", 409);
      // Preserve the original rendered schema/version as submission history when reclassifying.
      if (requestType) await tx.serviceRequest.update({ where: { issueId: id }, data: { requestTypeId: requestType.id } });
      if (participantIds !== undefined) {
        await tx.serviceRequestParticipant.deleteMany({ where: { requestId: row.requestId } });
        if ((participantIds as string[]).length) await tx.serviceRequestParticipant.createMany({ data: (participantIds as string[]).map(customerId => ({ requestId: row.requestId, customerId })) });
      }
      const activity = await tx.issueActivity.create({ data: { issueId: id, actorId: context.user.id, action: "issue.queue_triaged", changes: action as Prisma.InputJsonValue } });
      if (assigneeId && assigneeId !== existing.assigneeId) await createIssueNotifications(tx, { workspaceId: context.workspace.id, issueId: id, issueKey: `${project.key}-${existing.number}`, issueTitle: existing.summary, actorId: context.user.id, eventId: activity.id, type: "ASSIGNED", recipientIds: [assigneeId] });
      if (data.statusId) await tx.issueHistory.create({ data: { workspaceId: context.workspace.id, projectId: project.id, issueId: id, event: "STATUS_CHANGED", statusCategory: status!.category, estimate: existing.estimate } });
      await publishRealtime(tx, { workspaceId: context.workspace.id, projectId: project.id, type: "issue.updated", resourceId: id, payload: { id, version: row.version + 1 } });
      await enqueueWebhook(tx, { workspaceId: context.workspace.id, projectId: project.id, event: "issue.updated", eventId: `queue:${id}:${row.version + 1}`, data: { id, version: row.version + 1 } });
      await enqueueAutomation(tx, { workspaceId: context.workspace.id, projectId: project.id, event: data.statusId ? "issue.transitioned" : "issue.updated", eventId: `queue:${id}:${row.version + 1}`, payload: { issueId: id, projectId: project.id, statusId: status?.id ?? existing.statusId, priority: action.priority ?? existing.priority } as Prisma.InputJsonValue });
    }
    await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "service.queue.triaged", targetType: "serviceQueue", targetId: queueId, metadata: { snapshotId, issueIds: ids as string[], action: action as Prisma.InputJsonValue } } });
    return { updated: ids.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }); } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new QueueError("Concurrent changes detected. Refresh and retry.", 409);
    throw error;
  }
}
