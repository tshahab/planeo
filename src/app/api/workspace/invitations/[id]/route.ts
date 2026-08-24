import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role !== "OWNER" && context.role !== "ADMIN") return NextResponse.json({ error: "Workspace administration is required." }, { status: 403 });
  const { id } = await params;
  const invitation = await db.workspaceInvitation.findFirst({ where: { id, workspaceId: context.workspace.id, status: "PENDING" } });
  if (!invitation) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action === "revoke") {
    await db.workspaceInvitation.update({ where: { id }, data: { status: "REVOKED" } });
    await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "workspace.invitation_revoked", targetType: "invitation", targetId: id, metadata: {} } });
    return NextResponse.json({ revoked: true });
  }
  if (body?.action === "resend") {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.workspaceInvitation.update({ where: { id }, data: { tokenHash, expiresAt } });
    await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "workspace.invitation_resent", targetType: "invitation", targetId: id, metadata: {} } });
    return NextResponse.json({ expiresAt, ...(process.env.NODE_ENV !== "production" ? { acceptPath: `/invitations/${token}` } : {}) });
  }
  return NextResponse.json({ error: "Invalid invitation action." }, { status: 400 });
}
