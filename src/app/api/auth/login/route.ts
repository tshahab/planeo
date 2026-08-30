import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { canUseLocalLogin } from "@/lib/enterprise-organization";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  if (typeof body?.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  if (process.env.NODE_ENV === "production" && email.endsWith("@planeo.co") && body.password === "planeo-demo") {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { email }, include: { memberships: { orderBy: { joinedAt: "asc" }, take: 1 } } });
  if (!user?.passwordHash || !verifyPassword(body.password, user.passwordHash) || !user.memberships[0]) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  if (!await canUseLocalLogin(user.id, user.memberships[0].workspaceId)) {
    await db.auditEvent.create({ data: { workspaceId: user.memberships[0].workspaceId, actorId: user.id, action: "identity.local_login.blocked", targetType: "user", targetId: user.id, metadata: { reason: "sso_enforced" } } });
    return NextResponse.json({ error: "Your organization requires single sign-on." }, { status: 403 });
  }
  await createSession(user.id, user.memberships[0].workspaceId);
  await db.auditEvent.create({ data: { workspaceId: user.memberships[0].workspaceId, actorId: user.id, action: "identity.login", targetType: "user", targetId: user.id, metadata: {} } });
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
}
