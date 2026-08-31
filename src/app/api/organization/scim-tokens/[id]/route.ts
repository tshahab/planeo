import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizationAdmin } from "@/lib/enterprise-organization";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = await organizationAdmin(context.workspace.id, context.user.id);
  if (!admin) return NextResponse.json({ error: "Organization administration is required." }, { status: 403 });
  const { id } = await params;
  const token = await db.scimToken.findFirst({ where: { id, organizationId: admin.organizationId } });
  if (!token) return NextResponse.json({ error: "SCIM token not found." }, { status: 404 });
  await db.$transaction([
    db.scimToken.update({ where: { id }, data: { revokedAt: new Date() } }),
    db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "identity.scim_token.revoked", targetType: "scim_token", targetId: id, metadata: { prefix: token.prefix } } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
