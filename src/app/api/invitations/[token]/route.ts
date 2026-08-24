import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await db.workspaceInvitation.findUnique({ where: { tokenHash: tokenHash(token) }, include: { workspace: { select: { name: true } }, project: { select: { name: true, key: true } } } });
  if (!invitation || invitation.status !== "PENDING") return NextResponse.json({ error: "This invitation is invalid or has already been used." }, { status: 404 });
  if (invitation.expiresAt <= new Date()) return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });
  const existingUser = await db.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
  return NextResponse.json({ invitation: { email: invitation.email, workspaceName: invitation.workspace.name, projectName: invitation.project?.name ?? null, projectKey: invitation.project?.key ?? null, role: invitation.projectRole, expiresAt: invitation.expiresAt, requiresName: !existingUser } });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null) as { name?: unknown; password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (password.length < 10 || password.length > 200) return NextResponse.json({ error: "Password must contain at least 10 characters." }, { status: 400 });
  const invitation = await db.workspaceInvitation.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!invitation || invitation.status !== "PENDING") return NextResponse.json({ error: "This invitation is invalid or has already been used." }, { status: 404 });
  if (invitation.expiresAt <= new Date()) return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });

  const existingUser = await db.user.findUnique({ where: { email: invitation.email } });
  if (existingUser?.passwordHash && !verifyPassword(password, existingUser.passwordHash)) return NextResponse.json({ error: "The password is incorrect for this account." }, { status: 401 });
  if (existingUser && !existingUser.passwordHash) return NextResponse.json({ error: "This account uses a different sign-in method." }, { status: 400 });
  if (!existingUser && (!name || name.length > 120)) return NextResponse.json({ error: "Enter your name to create an account." }, { status: 400 });

  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.workspaceInvitation.updateMany({ where: { id: invitation.id, status: "PENDING", expiresAt: { gt: new Date() } }, data: { status: "ACCEPTED" } });
    if (claimed.count !== 1) throw new Error("INVITATION_ALREADY_CLAIMED");
    const user = existingUser ?? await tx.user.create({ data: { email: invitation.email, name, passwordHash: hashPassword(password) } });
    await tx.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } }, update: { role: invitation.workspaceRole, deactivatedAt: null }, create: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.workspaceRole } });
    if (invitation.projectId) await tx.projectMember.upsert({ where: { projectId_userId: { projectId: invitation.projectId, userId: user.id } }, update: { role: invitation.projectRole }, create: { projectId: invitation.projectId, userId: user.id, role: invitation.projectRole } });
    await tx.auditEvent.create({ data: { workspaceId: invitation.workspaceId, actorId: user.id, action: "invitation.accepted", targetType: "invitation", targetId: invitation.id, metadata: { projectId: invitation.projectId } } });
    return user;
  }).catch((cause: Error) => cause.message === "INVITATION_ALREADY_CLAIMED" ? null : Promise.reject(cause));
  if (!result) return NextResponse.json({ error: "This invitation has already been used." }, { status: 409 });
  await createSession(result.id, invitation.workspaceId);
  return NextResponse.json({ user: { id: result.id, email: result.email, name: result.name } });
}
