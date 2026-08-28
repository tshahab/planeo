import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { hashPassword, revokeAllSessions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown; password?: unknown } | null; const token = typeof body?.token === "string" ? body.token : ""; const password = typeof body?.password === "string" ? body.password : "";
  if (!token || password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return NextResponse.json({ error: "The reset token or password is invalid." }, { status: 400 });
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") }, include: { user: { include: { memberships: { take: 1 } } } } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return NextResponse.json({ error: "The reset token is invalid or expired." }, { status: 400 });
  const reset = await db.$transaction(async (tx) => { const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } }); if (claimed.count !== 1) throw new Error("RESET_ALREADY_CLAIMED"); await tx.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(password) } }); const membership = record.user.memberships[0]; if (membership) await tx.auditEvent.create({ data: { workspaceId: membership.workspaceId, actorId: record.userId, action: "identity.password_reset", targetType: "user", targetId: record.userId, metadata: {} } }); return true; }).catch((cause: Error) => cause.message === "RESET_ALREADY_CLAIMED" ? false : Promise.reject(cause));
  if (!reset) return NextResponse.json({ error: "The reset token has already been used." }, { status: 409 });
  await revokeAllSessions(record.userId);
  return NextResponse.json({ reset: true });
}
