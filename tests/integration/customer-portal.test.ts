import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createPortalSession, getPortalContext, portalProjectWhere, portalRequestWhere, type PortalContext } from "@/lib/portal-auth";
import { GET as searchRequests } from "@/app/api/portal/[workspace]/requests/route";
import { GET as download } from "@/app/api/portal/[workspace]/attachments/[id]/route";
import { GET as realtime } from "@/app/api/portal/[workspace]/realtime/route";
import { attachmentStorage } from "@/lib/storage";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name: string, value: string) => { jar.set(name, value); } }) }));

beforeEach(async () => { jar.clear(); await db.workspace.deleteMany({ where: { slug: { startsWith: "portal-test-" } } }); });
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
  it("does not bypass security levels when searching", async () => {
    const own = await fixture("search"); const hidden = await createRequest(own, 1);
    const level = await db.issueSecurityLevel.create({ data: { projectId: own.project.id, name: "Internal", grants: [] } });
    await db.issue.update({ where: { id: hidden.issueId }, data: { securityLevelId: level.id } });
    await createPortalSession(own.customer.id, own.workspace.id);
    const response = await searchRequests(new Request("http://localhost/api/portal/test/requests?q=Request"), { params: Promise.resolve({ workspace: own.workspace.slug }) });
    expect(await response.json()).toEqual({ requests: [] });
  });
  it("protects internal attachments and revokes access immediately", async () => {
    const own = await fixture("files"); const request = await createRequest(own, 1);
    const objectKey = `portal-test/${randomUUID()}`;
    await attachmentStorage.put(objectKey, new TextEncoder().encode("public"));
    try {
      const file = await db.attachment.create({ data: { issueId: request.issueId, fileName: "public.txt", objectKey, contentType: "text/plain", size: 6 } });
      await createPortalSession(own.customer.id, own.workspace.id);
      const args = { params: Promise.resolve({ workspace: own.workspace.slug, id: file.id }) };
      expect((await download(new Request("http://localhost"), args)).status).toBe(404);
      await db.attachment.update({ where: { id: file.id }, data: { portalVisible: true } });
      expect(await (await download(new Request("http://localhost"), args)).text()).toBe("public");
      await db.portalCustomer.update({ where: { id: own.customer.id }, data: { deactivatedAt: new Date() } });
      expect(await getPortalContext()).toBeNull();
      expect((await download(new Request("http://localhost"), args)).status).toBe(404);
    } finally { await attachmentStorage.delete(objectKey); }
  });
  it("serializes only authorized public realtime signals", async () => {
    const own = await fixture("events"), foreign = await fixture("eventsother");
    const visible = await createRequest(own, 1), hidden = await createRequest(foreign, 1);
    await db.realtimeEvent.createMany({ data: [
      { workspaceId: own.workspace.id, resourceId: visible.issueId, type: "issue.updated", payload: { secret: "never return" } },
      { workspaceId: own.workspace.id, resourceId: visible.issueId, type: "internal.note", payload: {} },
      { workspaceId: foreign.workspace.id, resourceId: hidden.issueId, type: "issue.updated", payload: {} },
    ] });
    await createPortalSession(own.customer.id, own.workspace.id);
    const response = await realtime(new Request("http://localhost/api/portal/test/realtime?since=2020-01-01"), { params: Promise.resolve({ workspace: own.workspace.slug }) });
    const body = await response.json(); expect(body.events).toHaveLength(1); expect(typeof body.events[0].id).toBe("string"); expect(body.events[0].type).toBe("request.changed"); expect(body.events[0].payload).toBeUndefined(); expect(body.events[0].resourceId).toBeUndefined(); expect(body.events[0].requestId).toBe(visible.id);
    const next = await realtime(new Request(`http://localhost/api/portal/test/realtime?cursor=${body.cursor}`), { params: Promise.resolve({ workspace: own.workspace.slug }) });
    expect((await next.json()).events).toEqual([]);
    expect((await realtime(new Request("http://localhost/api/portal/test/realtime?cursor=999999999999999999999999"), { params: Promise.resolve({ workspace: own.workspace.slug }) })).status).toBe(400);
  });
  it("never crosses workspace boundaries even when IDs are known", async () => { const own = await fixture("own"); const foreign = await fixture("foreign"); await createRequest(own, 1); const secret = await createRequest(foreign, 1); expect(await db.project.count({ where: portalProjectWhere(own.context) })).toBe(1); expect(await db.serviceRequest.findFirst({ where: { ...portalRequestWhere(own.context), id: secret.id } })).toBeNull(); });
  it("keeps private requests hidden from another authorized customer", async () => { const own = await fixture("private"); const secret = await createRequest(own, 1); const user = await db.user.create({ data: { name: "Other", email: `${randomUUID()}@invalid.planeo.local` } }); const other = await db.portalCustomer.create({ data: { workspaceId: own.workspace.id, issueReporterUserId: user.id, email: "other@customer.test", name: "Other", verifiedAt: new Date(), projects: { create: { projectId: own.project.id } } } }); const context: PortalContext = { ...own.context, customer: { ...own.context.customer, id: other.id, email: other.email, issueReporterUserId: user.id } }; expect(await db.serviceRequest.findFirst({ where: { ...portalRequestWhere(context), id: secret.id } })).toBeNull(); });
  it("revokes organization visibility with membership", async () => { const own = await fixture("org"); const organization = await db.customerOrganization.create({ data: { workspaceId: own.workspace.id, name: "Acme", members: { create: { customerId: own.customer.id } }, projects: { create: { projectId: own.project.id } } } }); own.context.organizationProjects = [{ organizationId: organization.id, projectId: own.project.id }]; const request = await createRequest(own, 1, "ORGANIZATION"); await db.serviceRequest.update({ where: { id: request.id }, data: { customerOrganizationId: organization.id, customerReporterId: null } }); expect(await db.serviceRequest.count({ where: portalRequestWhere(own.context) })).toBe(1); await db.customerOrganizationMember.update({ where: { organizationId_customerId: { organizationId: organization.id, customerId: own.customer.id } }, data: { active: false } }); expect(await db.serviceRequest.count({ where: portalRequestWhere(own.context) })).toBe(0); });
});
