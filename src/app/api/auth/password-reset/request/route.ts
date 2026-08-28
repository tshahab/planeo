import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null; const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const user = email ? await db.user.findUnique({ where: { email } }) : null; let developmentToken: string | undefined;
  if (user) { const token = randomBytes(32).toString("base64url"); developmentToken = process.env.NODE_ENV === "production" ? undefined : token; await db.$transaction(async (tx) => { const reset = await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } }); await enqueueEmail(tx, { userId: user.id, category: "PASSWORD_RESET", recipient: user.email, subject: "Reset your Planeo password", message: "A password reset was requested for your account. This link expires in 30 minutes and can be used once.", actionLabel: "Reset password", actionPath: `/reset-password?token=${token}`, dedupeKey: `password-reset:${reset.id}`, correlationId: reset.id }); }); }
  return NextResponse.json({ message: "If an account exists, password reset instructions have been prepared.", ...(developmentToken ? { developmentToken } : {}) });
}
