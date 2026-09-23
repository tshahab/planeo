import type { AuthContext } from "./auth";
import { db } from "./db";
import { accessibleProjectWhere } from "./project-query";
import { issueSecurityWhere } from "./permissions";
import { planDependencyInsights, visiblePlan, PlanError } from "./portfolio-plan";

export const GOAL_STATUSES = ["ON_TRACK", "AT_RISK", "OFF_TRACK", "ACHIEVED"] as const;
export const GOAL_VISIBILITIES = ["WORKSPACE", "PRIVATE"] as const;
export const GOAL_METHODS = ["MANUAL", "WORK"] as const;
export const GOAL_LINK_TYPES = ["ISSUE", "RELEASE", "PROJECT", "PLAN"] as const;

export const goalWhere = (context: AuthContext) => ({ workspaceId: context.workspace.id, archivedAt: null, OR: [{ visibility: "WORKSPACE" }, { ownerId: context.user.id }] });
export const manualGoalProgress = (currentValue: number, targetValue: number) => Math.min(100, Math.round(currentValue / targetValue * 100));

export async function visibleGoal(context: AuthContext, id: string) {
  const goal = await db.goal.findFirst({ where: { id, ...goalWhere(context) }, include: { owner: { select: { id: true, name: true } }, children: { where: goalWhere(context), select: { id: true, name: true, status: true } } } });
  if (!goal) throw new PlanError("Goal not found.", 404);
  return goal;
}

export function goalInput(value: Record<string, unknown>, existing?: { name: string; description: string | null; status: string; visibility: string; progressMethod: string; currentValue: number; targetValue: number; periodStart: Date; periodEnd: Date; parentId: string | null }) {
  const name = typeof value.name === "string" ? value.name.trim() : existing?.name ?? "", description = typeof value.description === "string" ? value.description.trim().slice(0, 1000) : existing?.description ?? null, status = GOAL_STATUSES.find(item => item === value.status) ?? existing?.status ?? "ON_TRACK", visibility = GOAL_VISIBILITIES.find(item => item === value.visibility) ?? existing?.visibility ?? "WORKSPACE", progressMethod = GOAL_METHODS.find(item => item === value.progressMethod) ?? existing?.progressMethod ?? "MANUAL", currentValue = value.currentValue === undefined ? existing?.currentValue ?? 0 : Number(value.currentValue), targetValue = value.targetValue === undefined ? existing?.targetValue ?? 100 : Number(value.targetValue), periodStart = value.periodStart === undefined ? existing?.periodStart : new Date(`${value.periodStart}T00:00:00Z`), periodEnd = value.periodEnd === undefined ? existing?.periodEnd : new Date(`${value.periodEnd}T23:59:59Z`), parentId = value.parentId === undefined ? existing?.parentId ?? null : typeof value.parentId === "string" ? value.parentId : null;
  if (!name || name.length > 200 || !Number.isInteger(currentValue) || !Number.isInteger(targetValue) || currentValue < 0 || targetValue < 1 || targetValue > 1_000_000 || currentValue > 1_000_000 || !periodStart || !periodEnd || !Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodStart >= periodEnd) throw new PlanError("Goal name, values, or period is invalid.");
  return { name, description: description || null, status, visibility, progressMethod, currentValue, targetValue, periodStart, periodEnd, parentId };
}

async function authorizedTarget(context: AuthContext, type: string, id: string) {
  if (type === "ISSUE") return db.issue.findFirst({ where: { id, workspaceId: context.workspace.id, archivedAt: null, project: { is: accessibleProjectWhere(context) }, AND: [await issueSecurityWhere(context)] }, select: { id: true, summary: true, completedAt: true, status: { select: { category: true } }, project: { select: { key: true } } } }).then(item => item && ({ id: item.id, label: `${item.project.key} · ${item.summary}` }));
  if (type === "PROJECT") return db.project.findFirst({ where: { id, ...accessibleProjectWhere(context) }, select: { id: true, name: true } }).then(item => item && ({ id: item.id, label: item.name }));
  if (type === "RELEASE") return db.release.findFirst({ where: { id, project: accessibleProjectWhere(context) }, select: { id: true, name: true } }).then(item => item && ({ id: item.id, label: item.name }));
  if (type === "PLAN") return visiblePlan(context, id).then(item => ({ id: item.id, label: item.name })).catch(() => null);
  return null;
}

export async function visibleGoalLinks(context: AuthContext, goalId: string) {
  await visibleGoal(context, goalId);
  const links = await db.goalLink.findMany({ where: { goalId }, orderBy: { createdAt: "asc" }, take: 500 });
  const resolved = await Promise.all(links.map(async link => ({ link, target: await authorizedTarget(context, link.targetType, link.targetId) })));
  return resolved.flatMap(({ link, target }) => target ? [{ ...link, target }] : []);
}

export async function goalProgress(context: AuthContext, goalId: string) {
  const goal = await visibleGoal(context, goalId);
  if (goal.progressMethod === "MANUAL") return { progress: manualGoalProgress(goal.currentValue, goal.targetValue), method: "MANUAL", visibleLinkedWork: 0, completedLinkedWork: 0 };
  const links = await visibleGoalLinks(context, goalId), issueIds = new Set<string>();
  for (const link of links) {
    if (link.targetType === "ISSUE") issueIds.add(link.targetId);
    if (link.targetType === "PROJECT") for (const item of await db.issue.findMany({ where: { projectId: link.targetId, workspaceId: context.workspace.id, archivedAt: null, AND: [await issueSecurityWhere(context)] }, select: { id: true }, take: 1000 })) issueIds.add(item.id);
    if (link.targetType === "RELEASE") for (const item of await db.issueRelease.findMany({ where: { releaseId: link.targetId, issue: { workspaceId: context.workspace.id, archivedAt: null, AND: [await issueSecurityWhere(context)] } }, select: { issueId: true }, take: 1000 })) issueIds.add(item.issueId);
    if (link.targetType === "PLAN") for (const node of (await planDependencyInsights(context, link.targetId)).nodes) issueIds.add(node.id);
  }
  const issues = issueIds.size ? await db.issue.findMany({ where: { id: { in: [...issueIds] }, workspaceId: context.workspace.id, project: { is: accessibleProjectWhere(context) }, AND: [await issueSecurityWhere(context)] }, select: { completedAt: true, status: { select: { category: true } } } }) : [];
  const completed = issues.filter(item => item.completedAt || item.status.category === "DONE").length;
  return { progress: issues.length ? Math.round(completed / issues.length * 100) : 0, method: "WORK", visibleLinkedWork: issues.length, completedLinkedWork: completed };
}

export async function validateGoalParent(context: AuthContext, goalId: string, parentId: string | null) {
  if (!parentId) return;
  const seen = new Set([goalId]); let cursor: string | null = parentId;
  for (let depth = 0; cursor && depth < 100; depth += 1) {
    if (seen.has(cursor)) throw new PlanError("Goal hierarchy cannot contain a cycle.", 409);
    seen.add(cursor);
    const parent: { parentId: string | null } | null = await db.goal.findFirst({ where: { id: cursor, ...goalWhere(context) }, select: { parentId: true } });
    if (!parent) throw new PlanError("Parent goal is invalid.");
    cursor = parent.parentId;
  }
  if (cursor) throw new PlanError("Goal hierarchy is too deep.");
}

export async function addGoalLink(context: AuthContext, goalId: string, value: Record<string, unknown>) {
  const goal = await visibleGoal(context, goalId);
  if (goal.ownerId !== context.user.id && !["OWNER", "ADMIN"].includes(context.role)) throw new PlanError("Goal ownership or workspace administration is required.", 403);
  const targetType = GOAL_LINK_TYPES.find(item => item === value.targetType), targetId = typeof value.targetId === "string" ? value.targetId : "";
  if (!targetType || !await authorizedTarget(context, targetType, targetId)) throw new PlanError("Linked work is not available.", 404);
  return db.$transaction(async tx => { const link = await tx.goalLink.create({ data: { goalId, targetType, targetId } }); await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "goal.link_created", targetType: "goal_link", targetId: link.id, metadata: { goalId, targetType } } }); return link; });
}
