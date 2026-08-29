import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { validateCustomFieldWrites } from "@/lib/custom-fields";

beforeEach(async () => { await db.workspace.deleteMany({ where: { slug: { startsWith: "custom-field-" } } }); });
afterAll(() => db.$disconnect());

async function fixture(suffix: string) {
  const workspace = await db.workspace.create({ data: { name: suffix, slug: `custom-field-${suffix}` } });
  const user = await db.user.create({ data: { name: suffix, email: `custom-${suffix}@example.test`, memberships: { create: { workspaceId: workspace.id, role: "OWNER" } } } });
  const project = await db.project.create({ data: { workspaceId: workspace.id, name: suffix, key: suffix.toUpperCase().slice(0, 5), members: { create: { userId: user.id, role: "ADMIN" } }, issueTypes: { create: { name: "Task", kind: "TASK", position: 0 } } }, include: { issueTypes: true } });
  return { workspace, user, project, type: project.issueTypes[0] };
}

describe("tenant-safe custom field values", () => {
  it("validates required typed values and rejects foreign field IDs transactionally", async () => {
    const own = await fixture("one"); const foreign = await fixture("two");
    const field = await db.customField.create({ data: { workspaceId: own.workspace.id, name: "Risk", type: "SINGLE_SELECT", options: ["low", "high"], projects: { create: { projectId: own.project.id, required: true } } } });
    const foreignField = await db.customField.create({ data: { workspaceId: foreign.workspace.id, name: "Secret", type: "TEXT", projects: { create: { projectId: foreign.project.id } } } });
    await expect(db.$transaction((tx) => validateCustomFieldWrites(tx, { workspaceId: own.workspace.id, projectId: own.project.id, issueTypeId: own.type.id, values: {} }))).rejects.toThrow(/required/i);
    await expect(db.$transaction((tx) => validateCustomFieldWrites(tx, { workspaceId: own.workspace.id, projectId: own.project.id, issueTypeId: own.type.id, values: { [field.id]: "invalid" } }))).rejects.toThrow(/does not match/i);
    await expect(db.$transaction((tx) => validateCustomFieldWrites(tx, { workspaceId: own.workspace.id, projectId: own.project.id, issueTypeId: own.type.id, values: { [foreignField.id]: "leak", [field.id]: "low" } }))).rejects.toThrow(/not configured/i);
    const values = await db.$transaction((tx) => validateCustomFieldWrites(tx, { workspaceId: own.workspace.id, projectId: own.project.id, issueTypeId: own.type.id, values: { [field.id]: "high" } }));
    expect(values.get(field.id)).toBe("high");
  });
});
