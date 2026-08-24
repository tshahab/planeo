import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null; const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const user = email ? await db.user.findUnique({ where: { email } }) : null; let developmentToken: string | undefined;
  if (user) { const token = randomBytes(32).toString("base64url"); developmentToken = process.env.NODE_ENV === "production" ? undefined : token; await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } }); }
  return NextResponse.json({ message: "If an account exists, password reset instructions have been prepared.", ...(developmentToken ? { developmentToken } : {}) });
}
