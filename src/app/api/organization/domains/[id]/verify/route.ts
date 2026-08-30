import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizationAdmin, verifyDomainChallenge } from "@/lib/enterprise-organization";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = await organizationAdmin(context.workspace.id, context.user.id);
  if (!admin) return NextResponse.json({ error: "Organization administration is required." }, { status: 403 });
  const { id } = await params;
  const domain = await db.organizationDomain.findFirst({ where: { id, organizationId: admin.organizationId } });
  if (!domain) return NextResponse.json({ error: "Domain claim not found." }, { status: 404 });
  if (!await verifyDomainChallenge(domain)) return NextResponse.json({ error: "The DNS challenge is missing, invalid, or expired." }, { status: 409 });
  await db.$transaction([
    db.organization.update({ where: { id: admin.organizationId }, data: { allowedDomains: { push: domain.domain } } }),
    db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "organization.domain.verified", targetType: "organization_domain", targetId: domain.id, metadata: { domain: domain.domain } } }),
  ]);
  return NextResponse.json({ verified: true });
}
