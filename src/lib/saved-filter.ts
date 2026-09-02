import type { AuthContext } from "./auth";
import { db } from "./db";
import { accessibleProjectWhere } from "./project-query";

const allowed = ["q", "project", "type", "status", "assignee", "reporter", "priority", "label", "sprint", "requestType", "from", "to", "sort"] as const;
export type SavedQuery = Partial<Record<typeof allowed[number], string>>;

export function normalizeSavedQuery(value: unknown): SavedQuery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>; const result: SavedQuery = {};
  for (const key of allowed) { const item = source[key]; if (item === undefined || item === "") continue; if (typeof item !== "string" || item.length > 200) return null; result[key] = item.trim(); }
  if (Object.keys(source).some((key) => !allowed.includes(key as typeof allowed[number]))) return null;
  return result;
}

export async function validateSavedQuery(context: AuthContext, query: SavedQuery) {
  const project = query.project ? await db.project.findFirst({ where: { ...accessibleProjectWhere(context), key: query.project.toUpperCase() }, select: { id: true } }) : null;
  if (query.project && !project) return false;
  const projectScope = project ? { projectId: project.id } : { project: accessibleProjectWhere(context) };
  const checks = await Promise.all([
    query.type ? db.issueType.count({ where: { id: query.type, ...projectScope } }) : 1,
    query.status ? db.status.count({ where: { id: query.status, ...projectScope } }) : 1,
    query.assignee ? db.workspaceMember.count({ where: { workspaceId: context.workspace.id, userId: query.assignee } }) : 1,
    query.reporter ? db.workspaceMember.count({ where: { workspaceId: context.workspace.id, userId: query.reporter } }) : 1,
    query.label ? db.label.count({ where: { workspaceId: context.workspace.id, id: query.label } }) : 1,
    query.sprint ? db.sprint.count({ where: { id: query.sprint, project: accessibleProjectWhere(context) } }) : 1,
    query.requestType ? db.serviceRequestType.count({ where: { id: query.requestType, project: accessibleProjectWhere(context) } }) : 1,
  ]);
  return checks.every(Boolean) && (!query.priority || ["URGENT", "HIGH", "MEDIUM", "LOW"].includes(query.priority.toUpperCase())) && (!query.sort || ["updated", "created", "priority", "due", "rank"].includes(query.sort));
}
