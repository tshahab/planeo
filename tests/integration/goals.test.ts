import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { goalProgress, goalWhere, validateGoalParent, visibleGoalLinks } from "@/lib/goals";
import type { AuthContext } from "@/lib/auth";

beforeEach(() => db.workspace.deleteMany({ where: { slug: { startsWith: "goal-" } } }));
afterAll(() => db.$disconnect());

async function fixture() {
  const suffix = Date.now().toString(), owner = await db.user.create({ data: { name: "Goal owner", email: `goal-owner-${suffix}@example.test` } }), viewer = await db.user.create({ data: { name: "Viewer", email: `goal-viewer-${suffix}@example.test` } });
  const workspace = await db.workspace.create({ data: { name: "Goals", slug: `goal-${suffix}`, memberships: { create: [{ userId: owner.id, role: "OWNER" }, { userId: viewer.id, role: "MEMBER" }] } } });
  const project = await db.project.create({ data: { workspaceId: workspace.id, name: "Visible", key: "GOAL", visibility: "PUBLIC", issueTypes: { create: { name: "Task", kind: "TASK", position: 0 } }, statuses: { create: [{ name: "Open", category: "TODO", color: "#888", position: 0 }, { name: "Done", category: "DONE", color: "#080", position: 1 }] } }, include: { issueTypes: true, statuses: true } });
  const issue = await db.issue.create({ data: { workspaceId: workspace.id, projectId: project.id, issueTypeId: project.issueTypes[0].id, statusId: project.statuses[1].id, reporterId: owner.id, number: 1, summary: "Completed outcome", rank: "a", completedAt: new Date() } });
  const common = { workspaceId: workspace.id, ownerId: owner.id, periodStart: new Date("2026-09-01"), periodEnd: new Date("2026-12-31") };
  const publicGoal = await db.goal.create({ data: { ...common, name: "Public outcome", progressMethod: "WORK", visibility: "WORKSPACE", links: { create: [{ targetType: "ISSUE", targetId: issue.id }, { targetType: "PROJECT", targetId: project.id }] } } }), privateGoal = await db.goal.create({ data: { ...common, name: "Secret outcome", visibility: "PRIVATE" } });
  const context = (user: typeof owner, role: "OWNER" | "MEMBER"): AuthContext => ({ role, user: { id: user.id, email: user.email, name: user.name, avatarUrl: null, timezone: "UTC", emailNotifications: true, inAppNotifications: true }, workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug } });
  return { ownerContext: context(owner, "OWNER"), viewerContext: context(viewer, "MEMBER"), publicGoal, privateGoal };
}

describe("goal access and progress", () => {
  it("keeps private goals independent from linked-work access and deduplicates progress", async () => {
    const { viewerContext, publicGoal, privateGoal } = await fixture();
    const visible = await db.goal.findMany({ where: goalWhere(viewerContext) });
    expect(visible.map(goal => goal.id)).toEqual([publicGoal.id]);
    const searched = await db.goal.findMany({ where: { ...goalWhere(viewerContext), AND: [{ OR: [{ name: { contains: "outcome", mode: "insensitive" } }] }] } });
    expect(searched.map(goal => goal.id)).toEqual([publicGoal.id]);
    expect(await visibleGoalLinks(viewerContext, publicGoal.id)).toHaveLength(2);
    expect(await goalProgress(viewerContext, publicGoal.id)).toMatchObject({ progress: 100, visibleLinkedWork: 1, completedLinkedWork: 1 });
    await expect(goalProgress(viewerContext, privateGoal.id)).rejects.toThrow(/not found/i);
  });

  it("preserves versioned updates and rejects hierarchy cycles", async () => {
    const { ownerContext, publicGoal, privateGoal } = await fixture();
    await db.goal.update({ where: { id: privateGoal.id }, data: { parentId: publicGoal.id } });
    await expect(validateGoalParent(ownerContext, publicGoal.id, privateGoal.id)).rejects.toThrow(/cycle/i);
    await db.goalUpdate.createMany({ data: [{ goalId: publicGoal.id, authorId: ownerContext.user.id, version: 1, status: "ON_TRACK", progress: 25 }, { goalId: publicGoal.id, authorId: ownerContext.user.id, version: 2, status: "AT_RISK", progress: 50 }] });
    expect(await db.goalUpdate.findMany({ where: { goalId: publicGoal.id }, orderBy: { version: "asc" } })).toMatchObject([{ version: 1, progress: 25 }, { version: 2, progress: 50 }]);
  });
});
