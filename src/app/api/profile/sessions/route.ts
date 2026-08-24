import { NextResponse } from "next/server";
import { clearSession, getAuthContext, revokeAllSessions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const sessions = await db.session.findMany({ where: { userId: context.user.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ sessions });
}

export async function DELETE() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  await revokeAllSessions(context.user.id);
  await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "identity.sessions_revoked", targetType: "user", targetId: context.user.id, metadata: {} } });
  await clearSession();
  return NextResponse.json({ ok: true });
}
