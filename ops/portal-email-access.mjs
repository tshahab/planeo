export async function mayDeliverPortalEmail(db, item) {
  if (!item.portalCustomerId) return true;
  const customer = await db.portalCustomer.findFirst({ where: { id: item.portalCustomerId, workspaceId: item.workspaceId, email: item.recipient, verifiedAt: { not: null }, deactivatedAt: null, emailNotifications: true } });
  if (!customer || await db.mailSuppression.count({ where: { workspaceId: item.workspaceId, email: item.recipient } })) return false;
  const request = await db.serviceRequest.findFirst({ where: { issueId: item.issueId, workspaceId: item.workspaceId, issue: { archivedAt: null, securityLevelId: null }, project: { archivedAt: null, template: "SERVICE", inboundMailbox: { enabled: true } } }, include: { participants: true } });
  if (!request) return false;
  const direct = await db.portalProjectCustomer.count({ where: { projectId: request.projectId, customerId: customer.id, enabled: true } });
  const orgs = await db.portalProjectOrganization.findMany({ where: { projectId: request.projectId, enabled: true, organization: { workspaceId: item.workspaceId, members: { some: { customerId: customer.id, active: true } } } }, select: { organizationId: true } });
  if (!direct && !orgs.length) return false;
  return request.customerReporterId === customer.id || request.sharing !== "PRIVATE" && request.participants.some(participant => participant.customerId === customer.id) || request.sharing === "ORGANIZATION" && orgs.some(org => org.organizationId === request.customerOrganizationId);
}
