import { db } from "./db";
import type { AuthContext } from "./auth";

export const issueInclude = {
  assignee: true,
  issueType: true,
  status: true,
  labels: { include: { label: true } },
  _count: { select: { comments: true, attachments: true } },
} as const;

export async function getProjectForContext(context: AuthContext, key: string) {
  const isWorkspaceAdmin = context.role === "OWNER" || context.role === "ADMIN";
  return db.project.findFirstOrThrow({
    where: {
      workspaceId: context.workspace.id,
      key: key.toUpperCase(),
      archivedAt: null,
      ...(isWorkspaceAdmin ? {} : { OR: [{ visibility: "PUBLIC" }, { members: { some: { userId: context.user.id } } }] }),
    },
  });
}
