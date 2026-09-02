import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key, id: sourceId } = await params; const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key: key.toUpperCase(), template: "SERVICE", archivedAt: null }, select: { id: true } });
  if (!["OWNER", "ADMIN"].includes(context.role) || !project || !await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as { targetCustomerId?: string } | null; const targetId = body?.targetCustomerId;
  if (!targetId || targetId === sourceId) return NextResponse.json({ error: "Choose a different target customer." }, { status: 400 });
  const customers = await db.portalCustomer.findMany({ where: { workspaceId: context.workspace.id, id: { in: [sourceId, targetId] }, deactivatedAt: null }, select: { id: true, issueReporterUserId: true, projects: true, organizations: true, participants: true } });
  if (customers.length !== 2) return NextResponse.json({ error: "Customer not found." }, { status: 404 }); const source = customers.find((item) => item.id === sourceId)!; const target = customers.find((item) => item.id === targetId)!;
  await db.$transaction(async (tx) => {
    for (const access of source.projects) await tx.portalProjectCustomer.upsert({ where: { projectId_customerId: { projectId: access.projectId, customerId: targetId } }, create: { projectId: access.projectId, customerId: targetId, enabled: access.enabled }, update: { enabled: access.enabled } });
    for (const membership of source.organizations) await tx.customerOrganizationMember.upsert({ where: { organizationId_customerId: { organizationId: membership.organizationId, customerId: targetId } }, create: { organizationId: membership.organizationId, customerId: targetId, active: membership.active }, update: { active: membership.active } });
    for (const participant of source.participants) await tx.serviceRequestParticipant.upsert({ where: { requestId_customerId: { requestId: participant.requestId, customerId: targetId } }, create: { requestId: participant.requestId, customerId: targetId }, update: {} });
    const reported = await tx.serviceRequest.findMany({ where: { customerReporterId: sourceId }, select: { id: true, issueId: true } });
    await tx.serviceRequest.updateMany({ where: { customerReporterId: sourceId }, data: { customerReporterId: targetId } }); await tx.issue.updateMany({ where: { id: { in: reported.map((item) => item.issueId) }, reporterId: source.issueReporterUserId }, data: { reporterId: target.issueReporterUserId } });
    await tx.portalComment.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }); await tx.portalNotification.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
    await tx.portalCustomerSession.updateMany({ where: { customerId: sourceId, revokedAt: null }, data: { revokedAt: new Date() } }); await tx.portalCustomer.update({ where: { id: sourceId }, data: { deactivatedAt: new Date() } });
    await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "portal.customer.merged", targetType: "portalCustomer", targetId, metadata: { sourceCustomerId: sourceId, projectId: project.id } } });
  });
  return NextResponse.json({ ok: true });
}
