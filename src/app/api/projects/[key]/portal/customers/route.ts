import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";
import { issuePortalToken } from "@/lib/portal-auth";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); const key = (await params).key.toUpperCase();
  const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key, template: "SERVICE", archivedAt: null }, select: { id: true } });
  if (!project || !await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const customers = await db.portalCustomer.findMany({ where: { workspaceId: context.workspace.id, OR: [{ projects: { some: { projectId: project.id } } }, { organizations: { some: { organization: { projects: { some: { projectId: project.id } } } } } }] }, select: { id: true, name: true, email: true, verifiedAt: true, deactivatedAt: true, organizations: { where: { active: true }, select: { organization: { select: { id: true, name: true } } } } }, orderBy: { name: "asc" } });
  return NextResponse.json({ customers });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); const key = (await params).key.toUpperCase();
  const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key, template: "SERVICE", archivedAt: null }, select: { id: true } });
  if (!project || !await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""; const name = typeof body?.name === "string" ? body.name.trim() : ""; const organizationId = typeof body?.organizationId === "string" ? body.organizationId : null; const enterpriseSubject = typeof body?.enterpriseSubject === "string" && body.enterpriseSubject.trim() ? body.enterpriseSubject.trim().slice(0, 255) : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 100) return NextResponse.json({ error: "Enter a valid name and email." }, { status: 400 });
  try {
    const result = await db.$transaction(async (tx) => {
      if (organizationId && !await tx.portalProjectOrganization.count({ where: { projectId: project.id, organizationId, organization: { workspaceId: context.workspace.id } } })) throw new Error("Customer organization is not authorized for this project.");
      let customer = await tx.portalCustomer.findUnique({ where: { workspaceId_email: { workspaceId: context.workspace.id, email } } });
      if (customer?.deactivatedAt) throw new Error("This customer account is deactivated.");
      if (!customer) {
        const backing = await tx.user.create({ data: { email: `portal-${randomUUID()}@invalid.planeo.local`, name } });
        customer = await tx.portalCustomer.create({ data: { workspaceId: context.workspace.id, issueReporterUserId: backing.id, email, name, enterpriseSubject } });
      } else if (enterpriseSubject && customer.enterpriseSubject !== enterpriseSubject) {
        customer = await tx.portalCustomer.update({ where: { id: customer.id }, data: { enterpriseSubject } });
      }
      await tx.portalProjectCustomer.upsert({ where: { projectId_customerId: { projectId: project.id, customerId: customer.id } }, create: { projectId: project.id, customerId: customer.id }, update: { enabled: true } });
      if (organizationId) await tx.customerOrganizationMember.upsert({ where: { organizationId_customerId: { organizationId, customerId: customer.id } }, create: { organizationId, customerId: customer.id }, update: { active: true } });
      await tx.portalCustomerToken.deleteMany({ where: { customerId: customer.id, purpose: "INVITATION", usedAt: null } }); const token = await issuePortalToken(tx, customer.id, "INVITATION", 48 * 60);
      await tx.emailDelivery.create({ data: { workspaceId: context.workspace.id, recipient: customer.email, category: "PORTAL_INVITATION", subject: `Join ${context.workspace.name} support`, textBody: `Activate your customer portal account: /portal/activate?token=${token}`, htmlBody: `<p>Activate your customer portal account: <a href="/portal/activate?token=${token}">Activate account</a></p>`, dedupeKey: `portal-invite:${customer.id}:${Date.now()}`, correlationId: `portal-invite:${customer.id}` } });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "portal.customer.invited", targetType: "portalCustomer", targetId: customer.id, metadata: { projectId: project.id, organizationId } } });
      return { id: customer.id, name: customer.name, email: customer.email, verifiedAt: customer.verifiedAt };
    });
    return NextResponse.json({ customer: result }, { status: 201 });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Customer could not be invited." }, { status: 409 }); }
}
