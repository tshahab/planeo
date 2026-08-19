import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";

const roles = ["ADMIN", "MEMBER", "VIEWER"] as const;
type ProjectRoleValue = typeof roles[number];

async function managementContext(key: string) {
  const context = await getAuthContext();
  if (!context) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const project = await getProjectForContext(context, key).catch(() => null);
  if (!project) return { error: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  const membership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } } });
  const canManage = context.role === "OWNER" || context.role === "ADMIN" || membership?.role === "ADMIN";
  if (!canManage) return { error: NextResponse.json({ error: "Project administration is required." }, { status: 403 }) };
  return { context, project };
}

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const result = await managementContext(key);
  if (result.error) return result.error;
  const { context, project } = result;
  const [members, pendingInvitations, workspaceMembers] = await Promise.all([
    db.projectMember.findMany({ where: { projectId: project.id }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } } }),
    db.workspaceInvitation.findMany({ where: { workspaceId: context.workspace.id, projectId: project.id, status: "PENDING", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, projectRole: true, expiresAt: true } }),
    db.workspaceMember.findMany({ where: { workspaceId: context.workspace.id, user: { projectRoles: { none: { projectId: project.id } } } }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } } }),
  ]);
  return NextResponse.json({
    members: members.map(({ role, user }) => ({ ...user, role })),
    pendingInvitations,
    availableMembers: workspaceMembers.map(({ user }) => user),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const result = await managementContext(key);
  if (result.error) return result.error;
  const { context, project } = result;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = roles.includes(body?.role as ProjectRoleValue) ? body?.role as ProjectRoleValue : "MEMBER";
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const workspaceMember = await db.workspaceMember.findFirst({ where: { workspaceId: context.workspace.id, user: { email } }, include: { user: true } });
  if (workspaceMember) {
    const membership = await db.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: workspaceMember.userId } }, update: { role }, create: { projectId: project.id, userId: workspaceMember.userId, role }, include: { user: { select: { id: true, name: true, email: true } } } });
    await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "project.member_added", targetType: "user", targetId: workspaceMember.userId, metadata: { projectId: project.id, role } } });
    return NextResponse.json({ member: { ...membership.user, role: membership.role } }, { status: 201 });
  }

  const existing = await db.workspaceInvitation.findFirst({ where: { workspaceId: context.workspace.id, projectId: project.id, email, status: "PENDING" } });
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitation = existing
    ? await db.workspaceInvitation.update({ where: { id: existing.id }, data: { projectRole: role, tokenHash, expiresAt } })
    : await db.workspaceInvitation.create({ data: { workspaceId: context.workspace.id, projectId: project.id, email, projectRole: role, tokenHash, invitedById: context.user.id, expiresAt } });
  await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "project.invitation_created", targetType: "invitation", targetId: invitation.id, metadata: { projectId: project.id, email, role } } });
  return NextResponse.json({ invitation: { id: invitation.id, email, projectRole: role, expiresAt, acceptPath: `/invitations/${token}` } }, { status: 202 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const result = await managementContext(key);
  if (result.error) return result.error;
  const { context, project } = result;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const role = roles.includes(body?.role as ProjectRoleValue) ? body?.role as ProjectRoleValue : null;
  if (!userId || !role) return NextResponse.json({ error: "Member and role are required." }, { status: 400 });
  if (userId === context.user.id && role !== "ADMIN") return NextResponse.json({ error: "You cannot remove your own project administration access." }, { status: 400 });
  const membership = await db.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId } }, data: { role }, include: { user: { select: { id: true, name: true, email: true } } } }).catch(() => null);
  if (!membership) return NextResponse.json({ error: "Project member not found." }, { status: 404 });
  await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "project.member_role_changed", targetType: "user", targetId: userId, metadata: { projectId: project.id, role } } });
  return NextResponse.json({ member: { ...membership.user, role: membership.role } });
}
