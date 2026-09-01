import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { validateRequestFormSchema } from "@/lib/request-forms";

beforeEach(async () => { await db.workspace.deleteMany({ where: { slug: { startsWith: "request-type-" } } }); });
afterAll(() => db.$disconnect());

async function fixture(suffix: string) {
  const workspace = await db.workspace.create({ data: { name: suffix, slug: `request-type-${suffix}` } });
  const user = await db.user.create({ data: { name: suffix, email: `request-${suffix}-${randomUUID()}@example.test`, memberships: { create: { workspaceId: workspace.id, role: "OWNER" } } } });
  const project = await db.project.create({ data: { workspaceId: workspace.id, name: suffix, key: suffix.toUpperCase().slice(0, 8), template: "SERVICE", members: { create: { userId: user.id, role: "ADMIN" } }, issueTypes: { create: { name: "Request", kind: "TASK", position: 0 } }, statuses: { create: { name: "Open", category: "TODO", color: "#888888", position: 0 } } }, include: { issueTypes: true, statuses: true } });
  return { workspace, user, project };
}

describe("versioned service request types", () => {
  it("rejects foreign custom fields and preserves published rendering for historical issues", async () => {
    const own = await fixture("own"), foreign = await fixture("foreign");
    const foreignField = await db.customField.create({ data: { workspaceId: foreign.workspace.id, name: "Internal secret", type: "TEXT", projects: { create: { projectId: foreign.project.id } } } });
    await expect(db.$transaction(tx => validateRequestFormSchema(tx, own.project.id, { fields: [{ key: "summary", label: "Subject", customerVisible: true }, { key: "secret", customFieldId: foreignField.id, label: "Secret", customerVisible: true }] }))).rejects.toThrow(/not customer-configurable/);
    const schema = { fields: [{ key: "summary", label: "Subject", required: true, customerVisible: true }] };
    const requestType = await db.requestType.create({ data: { projectId: own.project.id, issueTypeId: own.project.issueTypes[0].id, initialStatusId: own.project.statuses[0].id, name: "Help", draftSchema: schema, status: "PUBLISHED", publishedVersion: 1 } });
    const version = await db.requestTypeVersion.create({ data: { requestTypeId: requestType.id, version: 1, schema, createdById: own.user.id } });
    const issue = await db.issue.create({ data: { workspaceId: own.workspace.id, projectId: own.project.id, number: 1, issueTypeId: own.project.issueTypes[0].id, statusId: own.project.statuses[0].id, reporterId: own.user.id, summary: "Printer", rank: "a", requestTypeVersionId: version.id } });
    await db.requestType.update({ where: { id: requestType.id }, data: { status: "ARCHIVED", draftSchema: { fields: [{ key: "summary", label: "Changed", customerVisible: true }] } } });
    const historical = await db.issue.findUniqueOrThrow({ where: { id: issue.id }, include: { requestTypeVersion: true } });
    expect(historical.requestTypeVersion?.schema).toEqual(schema);
  });
});
