import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createBaseline, publishScenario, saveScenarioChange, scenarioSnapshot } from "@/lib/planning-scenarios";
import { validatePlanConfiguration } from "@/lib/portfolio-plan";
import type { AuthContext } from "@/lib/auth";

beforeEach(() => db.workspace.deleteMany({ where: { slug: { startsWith: "scenario-" } } }));
afterAll(() => db.$disconnect());

async function fixture() {
  const suffix = Date.now().toString(), owner = await db.user.create({ data: { name: "Planner", email: `scenario-owner-${suffix}@example.test` } }), viewer = await db.user.create({ data: { name: "Viewer", email: `scenario-viewer-${suffix}@example.test` } }), workspace = await db.workspace.create({ data: { name: "Scenarios", slug: `scenario-${suffix}`, memberships: { create: [{ userId: owner.id, role: "OWNER" }, { userId: viewer.id, role: "MEMBER" }] } } }), project = await db.project.create({ data: { workspaceId: workspace.id, name: "Private source", key: "SCEN", visibility: "PRIVATE", members: { create: { userId: owner.id, role: "ADMIN" } }, issueTypes: { create: { name: "Task", kind: "TASK", position: 0 } }, statuses: { create: { name: "Open", category: "TODO", color: "#888", position: 0 } } }, include: { issueTypes: true, statuses: true } }), issues = await Promise.all([1, 2].map(number => db.issue.create({ data: { workspaceId: workspace.id, projectId: project.id, issueTypeId: project.issueTypes[0].id, statusId: project.statuses[0].id, reporterId: owner.id, number, summary: `Scenario item ${number}`, rank: String(number), dueDate: new Date("2026-10-01") } }))), plan = await db.portfolioPlan.create({ data: { workspaceId: workspace.id, ownerId: owner.id, name: "Delivery plan", shared: true, configuration: validatePlanConfiguration({}), sources: { create: { kind: "PROJECT", projectId: project.id } } } }), scenario = await db.planScenario.create({ data: { planId: plan.id, ownerId: owner.id, name: "Accelerated", shared: true } });
  const context = (user: typeof owner, role: "OWNER" | "MEMBER"): AuthContext => ({ role, user: { id: user.id, email: user.email, name: user.name, avatarUrl: null, timezone: "UTC", emailNotifications: true, inAppNotifications: true }, workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug } });
  return { ownerContext: context(owner, "OWNER"), viewerContext: context(viewer, "MEMBER"), issues, plan, scenario };
}

describe("planning scenarios", () => {
  it("keeps edits isolated, baselines immutable, and hidden work undisclosed", async () => {
    const { ownerContext, viewerContext, issues, plan, scenario } = await fixture();
    await saveScenarioChange(ownerContext, scenario.id, issues[0].id, { patch: { dueDate: "2026-09-25" } });
    expect((await db.issue.findUniqueOrThrow({ where: { id: issues[0].id } })).dueDate?.toISOString().slice(0, 10)).toBe("2026-10-01");
    const baseline = await createBaseline(ownerContext, scenario.id, "Approved Q4");
    await db.issue.update({ where: { id: issues[0].id }, data: { summary: "Live name changed" } });
    expect(JSON.stringify((await db.scenarioBaseline.findUniqueOrThrow({ where: { id: baseline.id } })).snapshot)).toContain("Scenario item 1");
    expect((await scenarioSnapshot(viewerContext, plan.id)).issues).toEqual([]);
  });

  it("publishes valid selections and reports stale conflicts without silent loss", async () => {
    const { ownerContext, issues, scenario } = await fixture();
    const first = await saveScenarioChange(ownerContext, scenario.id, issues[0].id, { patch: { dueDate: "2026-09-25" } }), second = await saveScenarioChange(ownerContext, scenario.id, issues[1].id, { patch: { estimate: 8 } });
    await db.issue.update({ where: { id: issues[1].id }, data: { priority: "HIGH", version: { increment: 1 } } });
    const result = await publishScenario(ownerContext, scenario.id, [first.id, second.id]);
    expect(result).toMatchObject({ applied: [first.id], conflicts: [{ changeId: second.id, reason: "SOURCE_CHANGED" }] });
    expect((await db.issue.findUniqueOrThrow({ where: { id: issues[0].id } })).dueDate?.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(result.publish.status).toBe("PARTIAL");
    expect(JSON.stringify(result.publish.rollbackSnapshot)).toContain(issues[0].id);
  });
});
