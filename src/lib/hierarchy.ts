import { db } from "./db";
import type { AuthContext } from "./auth";
import { canViewIssue, requireProjectPermission, issueSecurityWhere } from "./permissions";
import { accessibleProjectWhere } from "./project-query";

export class HierarchyError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

export function validateHierarchyLevel(input: Record<string, unknown>) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const color = typeof input.color === "string" ? input.color.toLowerCase() : "";
  if (!name || name.length > 50) throw new HierarchyError("Level name must contain 1–50 characters.");
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new HierarchyError("Level color must be a six-digit hex color.");
  return { name, color };
}

export async function reparentIssue(context: AuthContext, input: { issueId: string; parentId: string | null; version: number }) {
  if (!Number.isInteger(input.version) || input.version < 1) throw new HierarchyError("A current issue version is required.");
  const [child, parent] = await Promise.all([
    db.issue.findFirst({ where: { id: input.issueId, workspaceId: context.workspace.id, archivedAt: null }, include: { issueType: true, hierarchyLevel: true } }),
    input.parentId ? db.issue.findFirst({ where: { id: input.parentId, workspaceId: context.workspace.id, archivedAt: null }, include: { issueType: true, hierarchyLevel: true } }) : null,
  ]);
  if (!child || !await canViewIssue(context, input.issueId) || input.parentId && (!parent || !await canViewIssue(context, input.parentId))) throw new HierarchyError("Issue not found.", 404);
  if (!await requireProjectPermission(context, child.projectId, "issue.edit") || parent && !await requireProjectPermission(context, parent.projectId, "issue.edit")) throw new HierarchyError("Issue not found.", 404);
  if (parent) {
    if (parent.id === child.id) throw new HierarchyError("An issue cannot be its own parent.", 409);
    const childRank = rank(child), parentRank = rank(parent);
    if (childRank === null || parentRank === null || parentRank >= childRank) throw new HierarchyError("Parent must be at a higher eligible hierarchy level.", 409);
    let cursor: string | null = parent.id; const seen = new Set<string>();
    while (cursor) { if (cursor === child.id) throw new HierarchyError("Parent change would create a hierarchy cycle.", 409); if (seen.has(cursor)) throw new HierarchyError("Existing hierarchy contains a cycle.", 409); seen.add(cursor); const next: { parentId: string | null } | null = await db.issue.findFirst({ where: { id: cursor, workspaceId: context.workspace.id }, select: { parentId: true } }); cursor = next?.parentId ?? null; }
  }
  try { return await db.$transaction(async tx => {
    const updated = await tx.issue.updateMany({ where: { id: child.id, workspaceId: context.workspace.id, version: input.version, parentId: child.parentId }, data: { parentId: parent?.id ?? null, version: { increment: 1 } } });
    if (!updated.count) throw new HierarchyError("Issue changed since it was loaded. Refresh and retry.", 409);
    await tx.issueActivity.create({ data: { issueId: child.id, actorId: context.user.id, action: "issue.reparented", changes: { parentId: { from: child.parentId, to: parent?.id ?? null }, crossProject: Boolean(parent && parent.projectId !== child.projectId) } } });
    await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "hierarchy.parent_changed", targetType: "issue", targetId: child.id, metadata: { fromParentId: child.parentId, toParentId: parent?.id ?? null, fromVersion: input.version } } });
    return tx.issue.findUniqueOrThrow({ where: { id: child.id }, select: { id: true, parentId: true, version: true } });
  }, { isolationLevel: "Serializable" }); } catch (cause) { if (cause instanceof HierarchyError) throw cause; throw new HierarchyError("Concurrent hierarchy change conflicted. Refresh and retry.", 409); }
}

export async function hierarchySummary(context: AuthContext, issueId: string) {
  if (!await canViewIssue(context, issueId)) throw new HierarchyError("Issue not found.", 404);
  const security = await issueSecurityWhere(context); const project = accessibleProjectWhere(context);
  const children = await db.issue.findMany({ where: { parentId: issueId, workspaceId: context.workspace.id, archivedAt: null, project: { is: project }, AND: [security] }, select: { id: true, number: true, summary: true, estimate: true, completedAt: true, project: { select: { key: true, name: true } }, hierarchyLevel: { select: { id: true, name: true, color: true } } }, orderBy: [{ project: { key: "asc" } }, { number: "asc" }] });
  const breadcrumbs: Array<{ id: string; key: string; summary: string }> = []; let cursor = await db.issue.findFirst({ where: { id: issueId, workspaceId: context.workspace.id }, select: { parentId: true } });
  while (cursor?.parentId && breadcrumbs.length < 20) { const ancestor = await db.issue.findFirst({ where: { id: cursor.parentId, workspaceId: context.workspace.id, archivedAt: null, project: { is: project }, AND: [security] }, select: { id: true, number: true, summary: true, parentId: true, project: { select: { key: true } } } }); if (!ancestor) break; breadcrumbs.unshift({ id: ancestor.id, key: `${ancestor.project.key}-${ancestor.number}`, summary: ancestor.summary }); cursor = ancestor; }
  return { breadcrumbs, children, rollup: { visibleChildren: children.length, completedChildren: children.filter(item => item.completedAt).length, estimate: children.reduce((sum, item) => sum + (item.estimate ?? 0), 0) } };
}

function rank(issue: { hierarchyLevel: { position: number } | null; issueType: { kind: string } }) { if (issue.hierarchyLevel) return issue.hierarchyLevel.position; if (issue.issueType.kind === "EPIC") return 10_000; return null; }
