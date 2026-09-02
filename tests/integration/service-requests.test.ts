import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { assertPortalSchemaReferences } from "@/lib/service-requests";

beforeEach(async () => { await db.workspace.deleteMany({ where: { slug: { startsWith: "service-request-" } } }); });
afterAll(() => db.$disconnect());

async function fixture(suffix: string) {
  const workspace = await db.workspace.create({ data: { name: suffix, slug: `service-request-${suffix}` } });
  const user = await db.user.create({ data: { name: suffix, email: `${randomUUID()}@service.test`, memberships: { create: { workspaceId: workspace.id, role: "OWNER" } } } });
  const project = await db.project.create({ data: { workspaceId: workspace.id, name: suffix, key: suffix.toUpperCase().slice(0, 8), template: "SERVICE", members: { create: { userId: user.id, role: "ADMIN" } }, issueTypes: { create: { name: "Request", kind: "TASK", position: 0 } }, statuses: { create: { name: "Open", category: "TODO", color: "#888888", position: 0 } } }, include: { issueTypes: true, statuses: true } });
  return { workspace, user, project };
}

describe("service request tenant and history boundaries", () => {
  it("rejects custom fields configured in another tenant", async () => {
    const own = await fixture("own"); const foreign = await fixture("foreign");
    const secret = await db.customField.create({ data: { workspaceId: foreign.workspace.id, name: "Secret", type: "TEXT", projects: { create: { projectId: foreign.project.id } } } });
    await expect(db.$transaction((tx) => assertPortalSchemaReferences(tx, own.workspace.id, own.project.id, { fields: [{ key: "summary", kind: "summary", label: "Summary", required: true }, { key: "secret", kind: "custom", customFieldId: secret.id, label: "Secret", required: false }] }))).rejects.toThrow(/not active/i);
  });

  it("preserves published versions and the exact historical rendering", async () => {
    const { workspace, user, project } = await fixture("history");
    const requestType = await db.serviceRequestType.create({ data: { projectId: project.id, issueTypeId: project.issueTypes[0].id, initialStatusId: project.statuses[0].id, name: "Help", draftSchema: { fields: [] } } });
    const first = await db.serviceRequestTypeVersion.create({ data: { requestTypeId: requestType.id, version: 1, name: "Help", schema: { fields: [{ key: "summary", kind: "summary", label: "Old label", required: true }] }, publishedById: user.id } });
    await db.serviceRequestTypeVersion.create({ data: { requestTypeId: requestType.id, version: 2, name: "Get help", schema: { fields: [{ key: "summary", kind: "summary", label: "New label", required: true }] }, publishedById: user.id } });
    const issue = await db.issue.create({ data: { workspaceId: workspace.id, projectId: project.id, number: 1, issueTypeId: project.issueTypes[0].id, statusId: project.statuses[0].id, reporterId: user.id, summary: "Historical", rank: "a" } });
    const submitted = await db.serviceRequest.create({ data: { workspaceId: workspace.id, projectId: project.id, issueId: issue.id, requestTypeId: requestType.id, requestTypeVersionId: first.id, submittedValues: { summary: "Historical" }, renderedSchema: first.schema as never } });
    const reloaded = await db.serviceRequest.findUniqueOrThrow({ where: { id: submitted.id }, include: { requestTypeVersion: true } });
    expect(reloaded.requestTypeVersion.version).toBe(1);
    expect(JSON.stringify(reloaded.renderedSchema)).toContain("Old label");
  });
});
