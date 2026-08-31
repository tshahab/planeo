import type { Prisma, ProjectRole, WorkspaceRole } from "@prisma/client";
import type { AuthContext } from "./auth";
import { db } from "./db";

export const PROJECT_PERMISSIONS = ["project.admin", "issue.view", "issue.create", "issue.edit", "issue.security", "sprint.manage", "release.manage", "export.run", "automation.manage", "integration.manage"] as const;
export type ProjectPermission = typeof PROJECT_PERMISSIONS[number];
export type PermissionMap = Partial<Record<ProjectPermission, string[]>>;
export type SecurityGrants = { reporter?: boolean; assignee?: boolean; workspaceRoles?: WorkspaceRole[]; projectRoles?: ProjectRole[]; groupIds?: string[]; userIds?: string[] };
type PolicyContext = Pick<AuthContext, "role"> & { user: Pick<AuthContext["user"], "id">; workspace: Pick<AuthContext["workspace"], "id"> };

const legacy: Record<ProjectPermission, string[]> = {
  "project.admin": ["WORKSPACE:OWNER", "WORKSPACE:ADMIN", "PROJECT:ADMIN"],
  "issue.view": ["WORKSPACE:OWNER", "WORKSPACE:ADMIN", "WORKSPACE:MEMBER", "WORKSPACE:VIEWER", "PROJECT:ADMIN", "PROJECT:MEMBER", "PROJECT:VIEWER"],
  "issue.create": ["WORKSPACE:OWNER", "WORKSPACE:ADMIN", "WORKSPACE:MEMBER", "PROJECT:ADMIN", "PROJECT:MEMBER"],
  "issue.edit": ["WORKSPACE:OWNER", "WORKSPACE:ADMIN", "WORKSPACE:MEMBER", "PROJECT:ADMIN", "PROJECT:MEMBER"],
  "issue.security": ["WORKSPACE:OWNER", "WORKSPACE:ADMIN", "PROJECT:ADMIN"],
  "sprint.manage": ["WORKSPACE:OWNER", "WORKSPACE:ADMIN", "WORKSPACE:MEMBER", "PROJECT:ADMIN", "PROJECT:MEMBER"],
  "release.manage": ["WORKSPACE:OWNER", "WORKSPACE:ADMIN", "PROJECT:ADMIN"],
  "export.run": ["WORKSPACE:OWNER", "WORKSPACE:ADMIN", "WORKSPACE:MEMBER", "PROJECT:ADMIN", "PROJECT:MEMBER", "PROJECT:VIEWER"],
  "automation.manage": ["WORKSPACE:OWNER", "WORKSPACE:ADMIN"],
  "integration.manage": ["WORKSPACE:OWNER", "WORKSPACE:ADMIN"],
};

export function validatePermissions(value: unknown): PermissionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A permission map is required.");
  const result: PermissionMap = {};
  for (const action of PROJECT_PERMISSIONS) {
    const grants = (value as Record<string, unknown>)[action];
    if (!Array.isArray(grants) || grants.some(grant => typeof grant !== "string" || !/^(WORKSPACE:(OWNER|ADMIN|MEMBER|VIEWER)|PROJECT:(ADMIN|MEMBER|VIEWER)|GROUP:[a-zA-Z0-9_-]+|USER:[a-zA-Z0-9_-]+)$/.test(grant))) throw new Error(`Explicit grants are required for ${action}.`);
    result[action] = [...new Set(grants as string[])];
  }
  return result;
}

export function validateSecurityGrants(value: unknown): SecurityGrants {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Security grants are required.");
  const input = value as Record<string, unknown>, result: SecurityGrants = {};
  if (input.reporter === true) result.reporter = true;
  if (input.assignee === true) result.assignee = true;
  for (const [key, allowed] of [["workspaceRoles", ["OWNER","ADMIN","MEMBER","VIEWER"]], ["projectRoles", ["ADMIN","MEMBER","VIEWER"]]] as const) if (input[key] !== undefined) {
    if (!Array.isArray(input[key]) || input[key].some(item => typeof item !== "string" || !allowed.includes(item as never))) throw new Error(`${key} contains an invalid role.`);
    (result as Record<string, unknown>)[key] = [...new Set(input[key] as string[])];
  }
  for (const key of ["groupIds", "userIds"] as const) if (input[key] !== undefined) {
    if (!Array.isArray(input[key]) || input[key].some(item => typeof item !== "string")) throw new Error(`${key} must contain IDs.`);
    result[key] = [...new Set(input[key] as string[])];
  }
  if (!Object.keys(result).length) throw new Error("A security level must grant at least one principal.");
  return result;
}

export function matchesIssueSecurity(grants: SecurityGrants | null, actor: { userId: string; workspaceRole: WorkspaceRole; projectRole?: ProjectRole | null; groupIds?: string[] }, issue: { reporterId: string; assigneeId: string | null }) {
  if (!grants) return true;
  return Boolean(grants.reporter && issue.reporterId === actor.userId || grants.assignee && issue.assigneeId === actor.userId || grants.userIds?.includes(actor.userId) || grants.workspaceRoles?.includes(actor.workspaceRole) || actor.projectRole && grants.projectRoles?.includes(actor.projectRole) || actor.groupIds?.some(id => grants.groupIds?.includes(id)));
}

async function actor(projectId: string, userId: string) {
  const [membership, groups] = await Promise.all([
    db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } }),
    db.organizationGroup.findMany({ where: { mappings: { some: { projectId } }, members: { some: { scimIdentity: { userId, active: true } } } }, select: { id: true } }),
  ]);
  return { projectRole: membership?.role ?? null, groupIds: groups.map(({ id }) => id) };
}

export async function explainProjectPermission(context: PolicyContext, projectId: string, permission: ProjectPermission) {
  const [project, principal] = await Promise.all([
    db.project.findFirst({ where: { id: projectId, workspaceId: context.workspace.id, archivedAt: null }, include: { permissionSchemeVersion: true } }),
    actor(projectId, context.user.id),
  ]);
  if (!project) return { allowed: false, reason: "project_not_found", matchedGrant: null };
  const grants = project.permissionSchemeVersion ? ((project.permissionSchemeVersion.permissions as PermissionMap)[permission] ?? []) : legacy[permission];
  const candidates = [`USER:${context.user.id}`, `WORKSPACE:${context.role}`, ...(principal.projectRole ? [`PROJECT:${principal.projectRole}`] : []), ...principal.groupIds.map(id => `GROUP:${id}`)];
  const matchedGrant = candidates.find(value => grants.includes(value)) ?? null;
  return { allowed: Boolean(matchedGrant), reason: matchedGrant ? "grant_matched" : "deny_by_default", matchedGrant, schemeVersionId: project.permissionSchemeVersionId };
}

export async function requireProjectPermission(context: PolicyContext, projectId: string, permission: ProjectPermission) { return (await explainProjectPermission(context, projectId, permission)).allowed; }

export async function issueSecurityWhere(context: PolicyContext, projectIds?: string[]): Promise<Prisma.IssueWhereInput> {
  const groups = await db.organizationGroup.findMany({ where: { mappings: { some: { workspaceId: context.workspace.id, ...(projectIds?.length ? { projectId: { in: projectIds } } : {}) } }, members: { some: { scimIdentity: { userId: context.user.id, active: true } } } }, select: { id: true } });
  const memberships = await db.projectMember.findMany({ where: { userId: context.user.id, project: { workspaceId: context.workspace.id, ...(projectIds?.length ? { id: { in: projectIds } } : {}) } }, select: { projectId: true, role: true } });
  const roleBranches = memberships.map(item => ({ projectId: item.projectId, securityLevel: { is: { grants: { path: ["projectRoles"], array_contains: [item.role] } } } }));
  return { OR: [
    { securityLevelId: null }, { reporterId: context.user.id }, { assigneeId: context.user.id },
    { securityLevel: { is: { grants: { path: ["userIds"], array_contains: [context.user.id] } } } },
    { securityLevel: { is: { grants: { path: ["workspaceRoles"], array_contains: [context.role] } } } },
    ...groups.map(group => ({ securityLevel: { is: { grants: { path: ["groupIds"], array_contains: [group.id] } } } })), ...roleBranches,
  ] };
}

export async function canViewIssue(context: PolicyContext, issueId: string) {
  return Boolean(await db.issue.findFirst({ where: { id: issueId, workspaceId: context.workspace.id, archivedAt: null, AND: [await issueSecurityWhere(context)] }, select: { id: true } }));
}
