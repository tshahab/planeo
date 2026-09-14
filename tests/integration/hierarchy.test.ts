import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hierarchySummary, reparentIssue } from "@/lib/hierarchy";
import type { AuthContext } from "@/lib/auth";

beforeEach(async () => db.workspace.deleteMany({ where: { slug: { startsWith: "hierarchy-integration-cleanup-" } } }));
afterAll(() => db.$disconnect());

async function fixture() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await db.user.create({ data: { name: "Owner", email: `hierarchy-${suffix}@example.test` } });
  const workspace = await db.workspace.create({ data: { name: "Hierarchy", slug: `hierarchy-${suffix}`, memberships: { create: { userId: user.id, role: "OWNER" } }, hierarchyLevels: { create: [{ name: "Initiative", color: "#6558d7", position: 0 }, { name: "Capability", color: "#3978b8", position: 1 }] } }, include: { hierarchyLevels: true } });
  const makeProject = (name: string, key: string) => db.project.create({ data: { workspaceId: workspace.id, name, key, issueTypes: { create: { name: "Epic", kind: "EPIC", position: 0 } }, statuses: { create: { name: "Open", category: "TODO", color: "#888888", position: 0 } } }, include: { issueTypes: true, statuses: true } });
  const [one, two] = await Promise.all([makeProject("One", "HONE"), makeProject("Two", "HTWO")]);
  const create = (project: typeof one, number: number, level?: number) => db.issue.create({ data: { workspaceId: workspace.id, projectId: project.id, issueTypeId: project.issueTypes[0].id, statusId: project.statuses[0].id, reporterId: user.id, number, summary: `Item ${number}`, rank: `h${number}`, hierarchyLevelId: level === undefined ? null : workspace.hierarchyLevels[level].id } });
  const [initiative, capability, epic] = await Promise.all([create(one, 1, 0), create(two, 1, 1), create(one, 2)]);
  const context: AuthContext = { role: "OWNER", user: { id: user.id, email: user.email, name: user.name, avatarUrl: null, timezone: "UTC", emailNotifications: true, inAppNotifications: true }, workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug } };
  return { context, initiative, capability, epic };
}

describe("configurable hierarchy", () => {
  it("allows authorized cross-project hierarchy and produces visible-only rollups", async () => { const { context, initiative, capability, epic } = await fixture(); await reparentIssue(context, { issueId: capability.id, parentId: initiative.id, version: 1 }); await reparentIssue(context, { issueId: epic.id, parentId: capability.id, version: 1 }); const summary = await hierarchySummary(context, initiative.id); expect(summary.rollup.visibleChildren).toBe(1); expect(summary.children[0].id).toBe(capability.id); });
  it("rejects cycles, invalid transitions, and stale concurrent changes", async () => { const { context, initiative, capability, epic } = await fixture(); const changed = await reparentIssue(context, { issueId: capability.id, parentId: initiative.id, version: 1 }); await expect(reparentIssue(context, { issueId: initiative.id, parentId: capability.id, version: 1 })).rejects.toThrow(/higher|cycle/i); await expect(reparentIssue(context, { issueId: epic.id, parentId: initiative.id, version: 0 })).rejects.toThrow(/version/i); await expect(reparentIssue(context, { issueId: capability.id, parentId: null, version: changed.version - 1 })).rejects.toThrow(/changed/i); });
});
