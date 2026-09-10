import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { processInboundMail, queueCustomerEmail } from "@/lib/service-email";
import { mayDeliverPortalEmail } from "../../ops/portal-email-access.mjs";
beforeEach(async () => {
  await db.portalComment.deleteMany({ where: { request: { project: { workspace: { slug: { startsWith: "mail-test-" } } } } } });
  await db.serviceMailbox.deleteMany({ where: { project: { workspace: { slug: { startsWith: "mail-test-" } } } } });
  await db.workspace.deleteMany({ where: { slug: { startsWith: "mail-test-" } } });
});
afterAll(() => db.$disconnect());
async function fixture() {
  const workspace = await db.workspace.create({ data: { name: "Mail", slug: `mail-test-${randomUUID()}` } });
  const user = await db.user.create({ data: { name: "Customer", email: `${randomUUID()}@invalid.test` } });
  const customer = await db.portalCustomer.create({ data: { workspaceId: workspace.id, issueReporterUserId: user.id, email: "customer@example.test", name: "Customer", verifiedAt: new Date() } });
  const project = await db.project.create({ data: { workspaceId: workspace.id, name: "Help", key: "HELP", template: "SERVICE", portalCustomers: { create: { customerId: customer.id } }, issueTypes: { create: { name: "Request", kind: "TASK", position: 0 } }, statuses: { create: { name: "Open", category: "TODO", color: "#888888", position: 0 } } }, include: { statuses: true, issueTypes: true } });
  const schema = { fields: [{ key: "summary", kind: "summary", label: "Summary", required: true }, { key: "description", kind: "description", label: "Details", required: true }] };
  const type = await db.serviceRequestType.create({ data: { projectId: project.id, name: "Email help", issueTypeId: project.issueTypes[0].id, initialStatusId: project.statuses[0].id, draftSchema: schema, publishedAt: new Date(), currentVersion: 1, versions: { create: { version: 1, name: "Email help", schema, publishedById: user.id } } } });
  const mailbox = await db.serviceMailbox.create({ data: { projectId: project.id, address: `${randomUUID()}@inbound.test`, requestTypeId: type.id, encryptedSecret: "unused-test-secret" } });
  function envelope(id = randomUUID(), parent = "", sender = customer.email) { return { providerId: id, verifiedSender: sender, recipient: mailbox.address, raw: Buffer.from(`From: ${sender}\r\nTo: ${mailbox.address}\r\nMessage-ID: <${id}@example.test>\r\nSubject: ${parent ? "Different subject" : "Help"}\r\n${parent ? `In-Reply-To: <${parent}@example.test>\r\n` : ""}\r\nCustomer message`).toString("base64") }; }
  return { workspace, customer, mailbox, project, envelope };
}
describe("service email authorization and delivery", () => {
  it("rechecks queued recipient access and keeps retry threading immutable", async () => {
    const f = await fixture(); await processInboundMail(f.mailbox.id, f.envelope());
    const request = await db.serviceRequest.findFirstOrThrow({ where: { projectId: f.project.id } });
    const eventKey = randomUUID();
    await db.$transaction(tx => queueCustomerEmail(tx, request.id, "Public reply", eventKey));
    const first = await db.emailDelivery.findUniqueOrThrow({ where: { dedupeKey: `portal-mail:${eventKey}:${f.customer.id}` } });
    await db.$transaction(tx => queueCustomerEmail(tx, request.id, "Public reply", eventKey));
    const retry = await db.emailDelivery.findUniqueOrThrow({ where: { id: first.id } });
    expect(retry.mailHeaders).toEqual(first.mailHeaders);
    expect(await mayDeliverPortalEmail(db, retry)).toBe(true);
    await db.portalProjectCustomer.updateMany({ where: { projectId: f.project.id }, data: { enabled: false } });
    expect(await mayDeliverPortalEmail(db, retry)).toBe(false);
  });
  it("deduplicates provider retries and message IDs and threads changed subjects", async () => {
    const f = await fixture(), first = f.envelope();
    expect(await processInboundMail(f.mailbox.id, first)).toMatchObject({ status: "ACCEPTED" });
    await processInboundMail(f.mailbox.id, { ...first, providerId: randomUUID() });
    expect(await db.serviceRequest.count({ where: { projectId: f.project.id } })).toBe(1);
    const reply = f.envelope(randomUUID(), first.providerId); await processInboundMail(f.mailbox.id, reply); await processInboundMail(f.mailbox.id, reply);
    const request = await db.serviceRequest.findFirstOrThrow({ where: { projectId: f.project.id } });
    expect(await db.portalComment.count({ where: { requestId: request.id } })).toBe(1);
    expect(await db.comment.count({ where: { issueId: request.issueId } })).toBe(0);
    expect(await db.emailDelivery.count({ where: { workspaceId: f.workspace.id } })).toBe(2);
  });
  it("quarantines unknown senders and refuses spoofed provider envelopes", async () => {
    const f = await fixture();
    expect(await processInboundMail(f.mailbox.id, f.envelope(randomUUID(), "", "unknown@example.test"))).toMatchObject({ status: "QUARANTINED" });
    await expect(processInboundMail(f.mailbox.id, { ...f.envelope(), verifiedSender: "attacker@example.test" })).rejects.toMatchObject({ reason: "sender_authentication_failed" });
    expect(await db.serviceRequest.count({ where: { projectId: f.project.id } })).toBe(0);
  });
  it("rechecks request security and refuses cross-project threading", async () => {
    const f = await fixture(), other = await fixture(), first = f.envelope(); await processInboundMail(f.mailbox.id, first);
    expect(await processInboundMail(other.mailbox.id, other.envelope(randomUUID(), first.providerId))).toMatchObject({ status: "QUARANTINED" });
    const request = await db.serviceRequest.findFirstOrThrow({ where: { projectId: f.project.id } });
    const level = await db.issueSecurityLevel.create({ data: { projectId: f.project.id, name: "Hidden", grants: {} } });
    await db.issue.update({ where: { id: request.issueId }, data: { securityLevelId: level.id } });
    expect(await processInboundMail(f.mailbox.id, f.envelope(randomUUID(), first.providerId))).toMatchObject({ status: "QUARANTINED" });
    expect(await db.portalComment.count({ where: { requestId: request.id } })).toBe(0);
  });
  it("keeps customer actions committed while suppression prevents new email", async () => {
    const f = await fixture(); await processInboundMail(f.mailbox.id, f.envelope());
    const request = await db.serviceRequest.findFirstOrThrow({ where: { projectId: f.project.id } });
    await db.mailSuppression.create({ data: { workspaceId: f.workspace.id, email: f.customer.email, reason: "HARD_BOUNCE" } });
    await db.$transaction(tx => queueCustomerEmail(tx, request.id, "A reply", randomUUID()));
    expect(await db.emailDelivery.count({ where: { workspaceId: f.workspace.id } })).toBe(1);
    expect(await db.serviceRequest.count({ where: { id: request.id } })).toBe(1);
  });
});
