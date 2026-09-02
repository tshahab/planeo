import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { portalProjectWhere, portalRequestWhere, type PortalContext } from "@/lib/portal-auth";

beforeEach(async () => { await db.workspace.deleteMany({ where: { slug: { startsWith: "portal-test-" } } }); });
afterAll(() => db.$disconnect());

async function fixture(suffix: string) {
  const workspace = await db.workspace.create({ data: { name: suffix, slug: `portal-test-${suffix}-${randomUUID().slice(0, 6)}` } });
  const agent = await db.user.create({ data: { name: "Agent", email: `${randomUUID()}@agent.test` } });
  const reporter = await db.user.create({ data: { name: "Portal identity", email: `${randomUUID()}@invalid.planeo.local` } });
  const customer = await db.portalCustomer.create({ data: { workspaceId: workspace.id, issueReporterUserId: reporter.id, email: `${suffix}@customer.test`, name: suffix, verifiedAt: new Date() } });
  const project = await db.project.create({ data: { workspaceId: workspace.id, name: suffix, key: suffix.toUpperCase().slice(0, 8), template: "SERVICE", issueTypes: { create: { name: "Request", kind: "TASK", position: 0 } }, statuses: { create: { name: "Open", category: "TODO", color: "#888", position: 0 } }, portalCustomers: { create: { customerId: customer.id } } }, include: { issueTypes: true, statuses: true } });
  const type = await db.serviceRequestType.create({ data: { projectId: project.id, issueTypeId: project.issueTypes[0].id, initialStatusId: project.statuses[0].id, name: "Help", draftSchema: { fields: [] } } });
  const version = await db.serviceRequestTypeVersion.create({ data: { requestTypeId: type.id, version: 1, name: "Help", schema: { fields: [] }, publishedById: agent.id } });
  const context: PortalContext = { customer: { id: customer.id, email: customer.email, name: customer.name, locale: "en", emailNotifications: true, issueReporterUserId: reporter.id }, workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name } };
  return { workspace, reporter, customer, project, type, version, context };
}

async function createRequest(f: Awaited<ReturnType<typeof fixture>>, number: number, sharing: "PRIVATE" | "ORGANIZATION" = "PRIVATE") { const issue = await db.issue.create({ data: { workspaceId: f.workspace.id, projectId: f.project.id, number, issueTypeId: f.project.issueTypes[0].id, statusId: f.project.statuses[0].id, reporterId: f.reporter.id, summary: `Request ${number}`, rank: `a${number}` } }); return db.serviceRequest.create({ data: { workspaceId: f.workspace.id, projectId: f.project.id, issueId: issue.id, requestTypeId: f.type.id, requestTypeVersionId: f.version.id, submittedValues: {}, renderedSchema: {}, customerReporterId: f.customer.id, sharing } }); }

describe("customer portal authorization", () => {
  it("never crosses workspace boundaries even when IDs are known", async () => { const own = await fixture("own"); const foreign = await fixture("foreign"); await createRequest(own, 1); const secret = await createRequest(foreign, 1); expect(await db.project.count({ where: portalProjectWhere(own.context) })).toBe(1); expect(await db.serviceRequest.findFirst({ where: { ...portalRequestWhere(own.context), id: secret.id } })).toBeNull(); });
  it("keeps private requests hidden from another authorized customer", async () => { const own = await fixture("private"); const secret = await createRequest(own, 1); const user = await db.user.create({ data: { name: "Other", email: `${randomUUID()}@invalid.planeo.local` } }); const other = await db.portalCustomer.create({ data: { workspaceId: own.workspace.id, issueReporterUserId: user.id, email: "other@customer.test", name: "Other", verifiedAt: new Date(), projects: { create: { projectId: own.project.id } } } }); const context: PortalContext = { ...own.context, customer: { ...own.context.customer, id: other.id, email: other.email, issueReporterUserId: user.id } }; expect(await db.serviceRequest.findFirst({ where: { ...portalRequestWhere(context), id: secret.id } })).toBeNull(); });
  it("revokes organization visibility with membership", async () => { const own = await fixture("org"); const organization = await db.customerOrganization.create({ data: { workspaceId: own.workspace.id, name: "Acme", members: { create: { customerId: own.customer.id } }, projects: { create: { projectId: own.project.id } } } }); const request = await createRequest(own, 1, "ORGANIZATION"); await db.serviceRequest.update({ where: { id: request.id }, data: { customerOrganizationId: organization.id, customerReporterId: null } }); expect(await db.serviceRequest.count({ where: portalRequestWhere(own.context) })).toBe(1); await db.customerOrganizationMember.update({ where: { organizationId_customerId: { organizationId: organization.id, customerId: own.customer.id } }, data: { active: false } }); expect(await db.serviceRequest.count({ where: portalRequestWhere(own.context) })).toBe(0); });
});
