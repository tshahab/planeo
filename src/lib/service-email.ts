import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { normalizeMail, MailRejected } from "./inbound-mail";
import { portalRequestWhere, type PortalContext } from "./portal-auth";
import { validatePortalSubmission, parsePortalSchema } from "./service-requests";
import { validateCustomFieldWrites } from "./custom-fields";
import { enqueueEmail } from "./email";
import { publishRealtime } from "./realtime";
import { attachmentStorage } from "./storage";
import { enqueueAutomation } from "./automation";
import { enqueueWebhook } from "./webhooks";

export async function mailCustomerContext(tx: Prisma.TransactionClient, workspaceId: string, email: string): Promise<PortalContext | null> {
  const customer = await tx.portalCustomer.findFirst({ where: { workspaceId, email, verifiedAt: { not: null }, deactivatedAt: null }, include: { workspace: true } });
  if (!customer) return null;
  const organizationProjects = await tx.portalProjectOrganization.findMany({ where: { enabled: true, project: { workspaceId }, organization: { workspaceId, members: { some: { customerId: customer.id, active: true } } } }, select: { organizationId: true, projectId: true } });
  return { customer, workspace: customer.workspace, organizationProjects };
}

export async function queueCustomerEmail(tx: Prisma.TransactionClient, requestId: string, body: string, eventKey: string) {
  const request = await tx.serviceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { project: { include: { inboundMailbox: true } }, issue: true, participants: true } });
  const mailbox = request.project.inboundMailbox; if (!mailbox?.enabled) return;
  // Send separately to each currently authorized customer; never expose other recipients.
  const ids = [...new Set([request.customerReporterId, ...request.participants.map(item => item.customerId)].filter((id): id is string => Boolean(id)))];
  const customers = await tx.portalCustomer.findMany({ where: { id: { in: ids }, workspaceId: request.workspaceId, emailNotifications: true, verifiedAt: { not: null }, deactivatedAt: null } });
  for (const customer of customers) {
    const context = await mailCustomerContext(tx, request.workspaceId, customer.email);
    if (!context || !await tx.serviceRequest.count({ where: { ...portalRequestWhere(context), id: requestId } }) || await tx.mailSuppression.count({ where: { workspaceId: request.workspaceId, email: customer.email } })) continue;
    const dedupeKey = `portal-mail:${eventKey}:${customer.id}`;
    await enqueueEmail(tx, { workspaceId: request.workspaceId, issueId: request.issueId, category: "PORTAL_CONVERSATION", recipient: customer.email, subject: `${request.project.key}-${request.issue.number}: ${request.issue.summary}`, message: body, actionLabel: "View request", actionPath: `/portal/${context.workspace.slug}/requests/${requestId}`, dedupeKey, correlationId: eventKey });
    const parent = await tx.inboundMessage.findFirst({ where: { mailboxId: mailbox.id, requestId, status: "ACCEPTED" }, orderBy: { receivedAt: "desc" } });
    await tx.emailDelivery.updateMany({ where: { dedupeKey, portalCustomerId: null }, data: { portalCustomerId: customer.id, mailHeaders: { "Message-ID": `<${randomUUID()}@${mailbox.address.split("@")[1]}>`, "Reply-To": mailbox.address, "X-Planeo-Loop": "1", ...(parent ? { "In-Reply-To": parent.messageId, References: parent.messageId } : {}) } } });
  }
}

export async function processInboundMail(mailboxId: string, envelope: { providerId: string; verifiedSender: string; recipient: string; raw: string }) {
  if (!envelope || typeof envelope.providerId !== "string" || !/^[\w.-]{1,150}$/.test(envelope.providerId) || typeof envelope.raw !== "string" || envelope.raw.length > 2800000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.raw) || typeof envelope.verifiedSender !== "string" || typeof envelope.recipient !== "string") throw new MailRejected("invalid_envelope");
  const parsed = await normalizeMail(Buffer.from(envelope.raw, "base64"));
  if (parsed.sender !== envelope.verifiedSender.toLowerCase()) throw new MailRejected("sender_authentication_failed");
  const objects: string[] = [];
  try {
    return await db.$transaction(async tx => {
      const mailbox = await tx.serviceMailbox.findFirst({ where: { id: mailboxId, enabled: true, address: envelope.recipient.toLowerCase(), project: { template: "SERVICE", archivedAt: null } }, include: { project: true } });
      if (!mailbox) throw new MailRejected("mailbox_unavailable");
      await tx.$queryRaw`SELECT id FROM "ServiceMailbox" WHERE id = ${mailbox.id} FOR UPDATE`;
      const duplicate = await tx.inboundMessage.findFirst({ where: { mailboxId, OR: [{ providerId: envelope.providerId }, { messageId: parsed.id }] } });
      if (duplicate) return { status: duplicate.status, duplicate: true };
      const record = { mailboxId, providerId: envelope.providerId, messageId: parsed.id, sender: parsed.sender };
      const context = await mailCustomerContext(tx, mailbox.project.workspaceId, parsed.sender);
      const reject = async (reason: string) => { await tx.inboundMessage.create({ data: { ...record, status: "QUARANTINED", reason } }); return { status: "QUARANTINED", duplicate: false }; };
      if (!context) return reject("unknown_or_inactive_sender");
      const parent = parsed.threadIds.length ? await tx.inboundMessage.findFirst({ where: { mailboxId, messageId: { in: parsed.threadIds }, status: "ACCEPTED" }, orderBy: { receivedAt: "desc" } }) : null;
      const outbound = parsed.threadIds.length ? await tx.emailDelivery.findFirst({ where: { workspaceId: context.workspace.id, portalCustomerId: context.customer.id, OR: parsed.threadIds.map(id => ({ mailHeaders: { path: ["Message-ID"], equals: id } })) }, select: { issueId: true } }) : null;
      let request = parent?.requestId ? await tx.serviceRequest.findFirst({ where: { ...portalRequestWhere(context), projectId: mailbox.projectId, id: parent.requestId } }) : outbound?.issueId ? await tx.serviceRequest.findFirst({ where: { ...portalRequestWhere(context), projectId: mailbox.projectId, issueId: outbound.issueId } }) : null;
      if (parsed.threadIds.length && !request) return reject("thread_unavailable");
      if (parsed.attachments.some(file => file.quarantined)) return reject("unsafe_attachment");
      if (!request) {
        const type = await tx.serviceRequestType.findFirst({ where: { id: mailbox.requestTypeId, projectId: mailbox.projectId, publishedAt: { not: null }, archivedAt: null, project: { OR: [{ portalCustomers: { some: { customerId: context.customer.id, enabled: true } } }, { portalOrganizations: { some: { enabled: true, organization: { members: { some: { customerId: context.customer.id, active: true } } } } } }] } }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
        const version = type?.versions[0]; if (!type || !version) return reject("request_type_unavailable");
        if (version.consentText) return reject("portal_consent_required");
        const schema = parsePortalSchema(version.schema), values = Object.fromEntries(schema.fields.flatMap(field => field.kind === "summary" ? [[field.key, parsed.subject]] : field.kind === "description" ? [[field.key, parsed.text]] : []));
        let validated; try { validated = validatePortalSubmission(schema, values); } catch { return reject("portal_fields_required"); }
        const fields = await validateCustomFieldWrites(tx, { workspaceId: context.workspace.id, projectId: mailbox.projectId, issueTypeId: type.issueTypeId, values: {}, partial: true });
        const sequence = await tx.project.update({ where: { id: mailbox.projectId }, data: { issueSequence: { increment: 1 } } });
        const issue = await tx.issue.create({ data: { workspaceId: context.workspace.id, projectId: mailbox.projectId, number: sequence.issueSequence, reporterId: context.customer.issueReporterUserId, issueTypeId: type.issueTypeId, statusId: type.initialStatusId, summary: parsed.subject, description: parsed.text, priority: mailbox.project.defaultPriority, rank: `a${Date.now().toString(36)}` } });
        for (const [fieldId, value] of fields) await tx.customFieldValue.create({ data: { fieldId, value, issueId: issue.id, workspaceId: context.workspace.id, projectId: mailbox.projectId } });
        request = await tx.serviceRequest.create({ data: { workspaceId: context.workspace.id, projectId: mailbox.projectId, issueId: issue.id, requestTypeId: type.id, requestTypeVersionId: version.id, customerReporterId: context.customer.id, sharing: "PRIVATE", renderedSchema: version.schema as Prisma.InputJsonValue, submittedValues: validated.values as Prisma.InputJsonValue } });
        await tx.issueActivity.create({ data: { issueId: issue.id, action: "service.request.created", changes: { requestTypeId: type.id, version: version.version, portalCustomerId: context.customer.id, source: "email" } } });
        await tx.issueHistory.create({ data: { workspaceId: context.workspace.id, projectId: mailbox.projectId, issueId: issue.id, event: "CREATED", statusCategory: (await tx.status.findUniqueOrThrow({ where: { id: type.initialStatusId } })).category, estimate: null } });
        await enqueueWebhook(tx, { workspaceId: context.workspace.id, projectId: mailbox.projectId, event: "issue.created", eventId: `issue.created:${issue.id}`, data: { id: issue.id, key: `${mailbox.project.key}-${issue.number}`, requestTypeId: type.id, version: issue.version } });
        await enqueueAutomation(tx, { workspaceId: context.workspace.id, projectId: mailbox.projectId, event: "issue.created", eventId: `issue.created:${issue.id}`, payload: { issueId: issue.id, projectId: mailbox.projectId, statusId: issue.statusId, priority: issue.priority, requestTypeId: type.id } });
      } else await tx.portalComment.create({ data: { requestId: request.id, customerId: context.customer.id, body: parsed.text, messageId: `inbound:${mailbox.id}:${parsed.id}` } });
      for (const file of parsed.attachments) {
        const objectKey = `service-email/${context.workspace.id}/${randomUUID()}`; await attachmentStorage.put(objectKey, file.content); objects.push(objectKey);
        await tx.attachment.create({ data: { issueId: request.issueId, objectKey, fileName: file.filename, contentType: file.contentType, size: file.size, portalVisible: true } });
      }
      const received = await tx.inboundMessage.create({ data: { ...record, status: "ACCEPTED", requestId: request.id } });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, action: "service.email.received", targetType: "serviceRequest", targetId: request.id, metadata: { inboundMessageId: received.id } } });
      await publishRealtime(tx, { workspaceId: context.workspace.id, projectId: mailbox.projectId, type: "issue.updated", resourceId: request.issueId, payload: { id: request.issueId } });
      await queueCustomerEmail(tx, request.id, "A customer message was received. Open the portal to view the conversation.", received.id);
      return { status: "ACCEPTED", duplicate: false };
    }, { timeout: 20000 });
  } catch (error) { for (const key of objects) await attachmentStorage.delete(key).catch(() => undefined); throw error; }
}
