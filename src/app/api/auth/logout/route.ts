import { NextResponse } from "next/server";
import { clearSession, getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  const context = await getAuthContext();
  if (context) await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "identity.logout", targetType: "user", targetId: context.user.id, metadata: {} } });
  await clearSession();
  return NextResponse.json({ ok: true });
}
