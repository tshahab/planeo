import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { explainProjectPermission, issueSecurityWhere, PROJECT_PERMISSIONS } from "@/lib/permissions";
import type { AuthContext } from "@/lib/auth";

beforeEach(async () => { await db.workspace.deleteMany({ where: { slug: { startsWith: "permission-test-" } } }); });
afterAll(() => db.$disconnect());

async function fixture() {
  const nonce = `${Date.now()}-${Math.random()}`;
  const owner = await db.user.create({ data: { email: `permission-owner-${nonce}@example.test`, name: "Owner" } });
  const member = await db.user.create({ data: { email: `permission-member-${nonce}@example.test`, name: "Member" } });
  const workspace = await db.workspace.create({
    data: { name: "Permissions", slug: `permission-test-${nonce}`, memberships: { create: [{ userId: owner.id, role: "OWNER" }, { userId: member.id, role: "MEMBER" }] }, projects: { create: { name: "Project", key: `P${String(Date.now()).slice(-7)}`, members: { create: { userId: member.id, role: "MEMBER" } } } } },
    include: { projects: true },
  });
  const context = (user: typeof owner, role: AuthContext["role"]): AuthContext => ({ user: { ...user, avatarUrl: null, timezone: "UTC", emailNotifications: true, inAppNotifications: true }, workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug }, role });
  return { owner, member, workspace, project: workspace.projects[0], context };
}

describe("permission schemes and issue security", () => {
  it("preserves legacy effective permissions until an explicit version is assigned", async () => {
    const f = await fixture();
    expect((await explainProjectPermission(f.context(f.member, "MEMBER"), f.project.id, "issue.edit")).allowed).toBe(true);
    const permissions = Object.fromEntries(PROJECT_PERMISSIONS.map(action => [action, []]));
    const scheme = await db.permissionScheme.create({ data: { workspaceId: f.workspace.id, name: "Restricted", versions: { create: { version: 1, createdById: f.owner.id, permissions } } }, include: { versions: true } });
    await db.project.update({ where: { id: f.project.id }, data: { permissionSchemeVersionId: scheme.versions[0].id } });
    expect(await explainProjectPermission(f.context(f.member, "MEMBER"), f.project.id, "issue.edit")).toMatchObject({ allowed: false, reason: "deny_by_default" });
  });

  it("filters secured issue existence without leaking it to another actor", async () => {
    const f = await fixture();
    const status = await db.status.create({ data: { projectId: f.project.id, name: "Open", category: "TODO", color: "#000", position: 0 } });
    const type = await db.issueType.create({ data: { projectId: f.project.id, name: "Task", kind: "TASK", position: 0 } });
    const level = await db.issueSecurityLevel.create({ data: { projectId: f.project.id, name: "Named", grants: { userIds: [f.owner.id] } } });
    const secured = await db.issue.create({ data: { workspaceId: f.workspace.id, projectId: f.project.id, number: 1, issueTypeId: type.id, statusId: status.id, reporterId: f.owner.id, summary: "Secret", rank: "a", securityLevelId: level.id } });
    expect(await db.issue.count({ where: { id: secured.id, AND: [await issueSecurityWhere(f.context(f.member, "MEMBER"), [f.project.id])] } })).toBe(0);
    expect(await db.issue.count({ where: { id: secured.id, AND: [await issueSecurityWhere(f.context(f.owner, "OWNER"), [f.project.id])] } })).toBe(1);
    await db.issueSecurityLevel.update({ where: { id: level.id }, data: { grants: { userIds: [f.member.id] } } });
    expect(await db.issue.count({ where: { id: secured.id, AND: [await issueSecurityWhere(f.context(f.member, "MEMBER"), [f.project.id])] } })).toBe(1);
  });
});
