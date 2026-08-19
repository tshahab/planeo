import type { AuthContext } from "./auth";
import { db } from "./db";

export function accessibleProjectWhere(context: AuthContext) {
  const isWorkspaceAdmin = context.role === "OWNER" || context.role === "ADMIN";
  return {
    workspaceId: context.workspace.id,
    archivedAt: null,
    ...(isWorkspaceAdmin ? {} : { OR: [{ visibility: "PUBLIC" as const }, { members: { some: { userId: context.user.id } } }] }),
  };
}

export async function listAccessibleProjects(context: AuthContext) {
  return db.project.findMany({ where: accessibleProjectWhere(context), orderBy: { name: "asc" }, select: { id: true, key: true, name: true, description: true, template: true, visibility: true } });
}
