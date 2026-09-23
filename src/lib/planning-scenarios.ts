import type { Prisma } from "@prisma/client";
import type { AuthContext } from "./auth";
import { db } from "./db";
import { accessibleProjectWhere } from "./project-query";
import { issueSecurityWhere, requireProjectPermission } from "./permissions";
import { planDependencyInsights, visiblePlan, PlanError } from "./portfolio-plan";
import { dateInput, points, weekKey } from "./capacity-planning";

type Patch = { dueDate?: string | null; assigneeId?: string | null; parentId?: string | null; estimate?: number | null; dependencies?: Array<{ issueId: string; type: string; lagDays: number }>; allocations?: Array<{ teamId: string; weekStart: string; estimatePoints: number }> };
const issueSelect = { id: true, version: true, dueDate: true, assigneeId: true, parentId: true, estimate: true, projectId: true, summary: true } as const;
const json = (value: unknown) => value as Prisma.InputJsonValue;
export function scenarioIssueUpdate(patch: Patch) { return { ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ? new Date(patch.dueDate) : null } : {}), ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}), ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}), ...(patch.estimate !== undefined ? { estimate: patch.estimate } : {}), version: { increment: 1 } } as const; }

export async function scenarioSnapshot(context: AuthContext, planId: string) {
  const graph = await planDependencyInsights(context, planId), ids = graph.nodes.map(node => node.id);
  const issues = ids.length ? await db.issue.findMany({ where: { id: { in: ids }, workspaceId: context.workspace.id, project: { is: accessibleProjectWhere(context) }, AND: [await issueSecurityWhere(context)] }, select: issueSelect, orderBy: { id: "asc" } }) : [];
  const links = ids.length ? await db.issueLink.findMany({ where: { outwardIssueId: { in: ids }, inwardIssueId: { in: ids } }, select: { outwardIssueId: true, inwardIssueId: true, type: true, lagDays: true, version: true }, orderBy: { id: "asc" } }) : [];
  const allocations = ids.length ? await db.planAllocation.findMany({ where: { planId, issueId: { in: ids } }, select: { issueId: true, teamId: true, weekStart: true, estimatePoints: true, version: true }, orderBy: { id: "asc" } }) : [];
  return { capturedAt: new Date().toISOString(), issues: issues.map(issue => ({ ...issue, dueDate: issue.dueDate?.toISOString() ?? null })), links, allocations: allocations.map(item => ({ ...item, weekStart: item.weekStart.toISOString() })) };
}

export async function visibleScenario(context: AuthContext, id: string) {
  const row = await db.planScenario.findFirst({ where: { id, archivedAt: null, plan: { workspaceId: context.workspace.id, archivedAt: null }, OR: [{ ownerId: context.user.id }, { shared: true }] }, include: { owner: { select: { id: true, name: true } }, plan: { select: { id: true, name: true, ownerId: true, shared: true } } } });
  if (!row) throw new PlanError("Scenario not found.", 404);
  await visiblePlan(context, row.planId);
  return row;
}

function scenarioEditor(context: AuthContext, scenario: { ownerId: string }) {
  if (scenario.ownerId !== context.user.id) throw new PlanError("Only the scenario owner can edit it.", 403);
}

async function authorizedIssue(context: AuthContext, scenarioId: string, issueId: string) {
  const scenario = await visibleScenario(context, scenarioId), ids = new Set((await planDependencyInsights(context, scenario.planId)).nodes.map(node => node.id));
  if (!ids.has(issueId)) throw new PlanError("Issue is not available in this scenario's plan.", 404);
  const issue = await db.issue.findFirst({ where: { id: issueId, workspaceId: context.workspace.id, archivedAt: null, project: { is: accessibleProjectWhere(context) }, AND: [await issueSecurityWhere(context)] }, select: issueSelect });
  if (!issue) throw new PlanError("Issue is not available in this scenario's plan.", 404);
  return { scenario, issue };
}

export async function normalizeScenarioPatch(context: AuthContext, scenarioId: string, issueId: string, value: unknown): Promise<Patch> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlanError("Scenario patch is required.");
  const input = value as Record<string, unknown>, patch: Patch = {};
  if ("dueDate" in input) patch.dueDate = input.dueDate === null ? null : dateInput(input.dueDate, "dueDate").toISOString();
  if ("estimate" in input) patch.estimate = input.estimate === null ? null : points(input.estimate, "Estimate");
  for (const field of ["assigneeId", "parentId"] as const) if (field in input) patch[field] = input[field] === null ? null : typeof input[field] === "string" ? input[field] : (() => { throw new PlanError(`${field} is invalid.`); })();
  if (patch.assigneeId && !await db.workspaceMember.count({ where: { workspaceId: context.workspace.id, userId: patch.assigneeId } })) throw new PlanError("Assignee is not a workspace member.");
  if (patch.parentId) { await authorizedIssue(context, scenarioId, patch.parentId); let cursor: string | null = patch.parentId; const seen = new Set<string>(); while (cursor) { if (cursor === issueId) throw new PlanError("Proposed parent would create a hierarchy cycle.", 409); if (seen.has(cursor)) throw new PlanError("Existing hierarchy contains a cycle.", 409); seen.add(cursor); const next: { parentId: string | null } | null = await db.issue.findUnique({ where: { id: cursor }, select: { parentId: true } }); cursor = next?.parentId ?? null; } }
  if (Array.isArray(input.dependencies)) { patch.dependencies = []; for (const raw of input.dependencies) { if (!raw || typeof raw !== "object") throw new PlanError("Dependency is invalid."); const item = raw as Record<string, unknown>, target = typeof item.issueId === "string" ? item.issueId : ""; await authorizedIssue(context, scenarioId, target); const type = typeof item.type === "string" && item.type.length <= 30 ? item.type : "blocks", lagDays = Number(item.lagDays ?? 0); if (!Number.isInteger(lagDays) || lagDays < -365 || lagDays > 365 || target === issueId) throw new PlanError("Dependency is invalid."); patch.dependencies.push({ issueId: target, type, lagDays }); } }
  if (Array.isArray(input.allocations)) { patch.allocations = []; for (const raw of input.allocations) { if (!raw || typeof raw !== "object") throw new PlanError("Allocation is invalid."); const item = raw as Record<string, unknown>, teamId = typeof item.teamId === "string" ? item.teamId : "", team = await db.planningTeam.count({ where: { id: teamId, workspaceId: context.workspace.id, archivedAt: null } }); if (!team) throw new PlanError("Planning team is unavailable.", 404); patch.allocations.push({ teamId, weekStart: weekKey(dateInput(item.weekStart, "weekStart")).toISOString(), estimatePoints: points(item.estimatePoints, "Allocation") }); } }
  if (!Object.keys(patch).length) throw new PlanError("At least one supported scenario change is required.");
  return patch;
}

export async function saveScenarioChange(context: AuthContext, scenarioId: string, issueId: string, value: Record<string, unknown>) {
  const { scenario, issue } = await authorizedIssue(context, scenarioId, issueId); scenarioEditor(context, scenario);
  const patch = await normalizeScenarioPatch(context, scenarioId, issueId, value.patch);
  const existing = await db.scenarioChange.findUnique({ where: { scenarioId_issueId: { scenarioId, issueId } } });
  if (existing && (!Number.isInteger(value.version) || value.version !== existing.version)) throw new PlanError("Scenario change changed since it was loaded. Refresh and retry.", 409);
  const baseSnapshot = { dueDate: issue.dueDate?.toISOString() ?? null, assigneeId: issue.assigneeId, parentId: issue.parentId, estimate: issue.estimate };
  return db.$transaction(async tx => { const change = existing ? await tx.scenarioChange.update({ where: { id: existing.id }, data: { patch: json(patch), version: { increment: 1 } } }) : await tx.scenarioChange.create({ data: { scenarioId, issueId, baseVersion: issue.version, baseSnapshot: json(baseSnapshot), patch: json(patch) } }); await tx.planScenario.update({ where: { id: scenarioId }, data: { version: { increment: 1 } } }); await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "scenario.change_saved", targetType: "scenario_change", targetId: change.id, metadata: { scenarioId, issueId } } }); return change; });
}

export async function createBaseline(context: AuthContext, scenarioId: string, name: string) {
  const scenario = await visibleScenario(context, scenarioId); scenarioEditor(context, scenario); if (!name || name.length > 100) throw new PlanError("Baseline name must contain 1–100 characters.");
  const source = await scenarioSnapshot(context, scenario.planId), changes = await db.scenarioChange.findMany({ where: { scenarioId }, select: { issueId: true, baseVersion: true, baseSnapshot: true, patch: true, version: true }, orderBy: { issueId: "asc" } }), snapshot = { scenario: { id: scenario.id, name: scenario.name, version: scenario.version }, source, changes };
  return db.$transaction(async tx => { const baseline = await tx.scenarioBaseline.create({ data: { scenarioId, authorId: context.user.id, name, snapshot: json(snapshot) } }); await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "scenario.baseline_created", targetType: "scenario_baseline", targetId: baseline.id, metadata: { scenarioId, name } } }); return baseline; });
}

export async function publishScenario(context: AuthContext, scenarioId: string, selectedIds: unknown) {
  const scenario = await visibleScenario(context, scenarioId); if (scenario.plan.ownerId !== context.user.id && !["OWNER", "ADMIN"].includes(context.role)) throw new PlanError("Plan ownership or workspace administration is required to publish.", 403);
  if (!Array.isArray(selectedIds) || !selectedIds.length || selectedIds.length > 500 || selectedIds.some(id => typeof id !== "string")) throw new PlanError("Select 1–500 scenario changes to publish.");
  const changes = await db.scenarioChange.findMany({ where: { scenarioId, id: { in: selectedIds as string[] } }, orderBy: { id: "asc" } }), applied: string[] = [], conflicts: Array<{ changeId: string; issueId: string; reason: string }> = [], rollback: Array<{ issueId: string; version: number; snapshot: unknown }> = [];
  const authorizedIds = new Set((await planDependencyInsights(context, scenario.planId)).nodes.map(node => node.id));
  const valid: Array<{ change: typeof changes[number]; issue: Prisma.IssueGetPayload<Record<string, never>>; patch: Patch }> = [];
  for (const change of changes) { const issue = await db.issue.findFirst({ where: { id: change.issueId, workspaceId: context.workspace.id, project: { is: accessibleProjectWhere(context) }, AND: [await issueSecurityWhere(context)] } }); if (!issue || !authorizedIds.has(change.issueId) || !await requireProjectPermission(context, issue.projectId, "issue.edit")) { conflicts.push({ changeId: change.id, issueId: change.issueId, reason: "NOT_AUTHORIZED" }); continue; } if (issue.version !== change.baseVersion) { conflicts.push({ changeId: change.id, issueId: change.issueId, reason: "SOURCE_CHANGED" }); continue; } valid.push({ change, issue, patch: change.patch as unknown as Patch }); }
  const record = await db.$transaction(async tx => { for (const { change, issue, patch } of valid) { const updated = await tx.issue.updateMany({ where: { id: issue.id, version: change.baseVersion }, data: scenarioIssueUpdate(patch) }); if (!updated.count) throw new PlanError("Source data changed during publishing. Refresh and retry.", 409); rollback.push({ issueId: issue.id, version: issue.version, snapshot: change.baseSnapshot }); if (patch.dependencies) for (const dependency of patch.dependencies) await tx.issueLink.upsert({ where: { outwardIssueId_inwardIssueId_type: { outwardIssueId: issue.id, inwardIssueId: dependency.issueId, type: dependency.type } }, update: { lagDays: dependency.lagDays, version: { increment: 1 } }, create: { outwardIssueId: issue.id, inwardIssueId: dependency.issueId, type: dependency.type, lagDays: dependency.lagDays } }); if (patch.allocations) for (const allocation of patch.allocations) await tx.planAllocation.upsert({ where: { planId_issueId_weekStart: { planId: scenario.planId, issueId: issue.id, weekStart: new Date(allocation.weekStart) } }, update: { teamId: allocation.teamId, estimatePoints: allocation.estimatePoints, version: { increment: 1 } }, create: { planId: scenario.planId, issueId: issue.id, teamId: allocation.teamId, weekStart: new Date(allocation.weekStart), estimatePoints: allocation.estimatePoints } }); applied.push(change.id); }
    const status = applied.length && conflicts.length ? "PARTIAL" : applied.length ? "COMPLETED" : "CONFLICTED"; const publish = await tx.scenarioPublish.create({ data: { scenarioId, actorId: context.user.id, status, requestedChanges: json(selectedIds), appliedChanges: json(applied), conflicts: json(conflicts), rollbackSnapshot: json(rollback) } }); await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "scenario.published", targetType: "scenario_publish", targetId: publish.id, metadata: { scenarioId, status, applied: applied.length, conflicts: conflicts.length } } }); return publish; });
  return { publish: record, applied, conflicts };
}
