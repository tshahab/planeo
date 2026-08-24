import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const roles = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role !== "OWNER" && context.role !== "ADMIN") return NextResponse.json({ error: "Workspace administration is required." }, { status: 403 });
  const { userId } = await params;
  const body = await request.json().catch(() => null) as { action?: unknown; role?: unknown } | null;
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: context.workspace.id, userId } } });
  if (!member) return NextResponse.json({ error: "Member not found." }, { status: 404 });
  if (context.role !== "OWNER" && member.role === "OWNER") return NextResponse.json({ error: "Only owners can manage owners." }, { status: 403 });
  if (userId === context.user.id && (body?.action === "deactivate" || body?.action === "remove" || (body?.role !== undefined && body.role !== context.role))) return NextResponse.json({ error: "You cannot remove or reduce your own access." }, { status: 400 });
  if (member.role === "OWNER" && (body?.action === "deactivate" || body?.action === "remove" || (body?.role !== undefined && body.role !== "OWNER"))) {
    const owners = await db.workspaceMember.count({ where: { workspaceId: context.workspace.id, role: "OWNER", deactivatedAt: null } });
    if (owners <= 1) return NextResponse.json({ error: "The workspace must retain an active owner." }, { status: 400 });
  }
  if (body?.role !== undefined) {
    if (!roles.includes(body.role as typeof roles[number])) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    if (context.role !== "OWNER" && (member.role === "OWNER" || body.role === "OWNER")) return NextResponse.json({ error: "Only owners can manage owners." }, { status: 403 });
    const role = body.role as typeof roles[number];
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: context.workspace.id, userId } }, data: { role } });
    await audit("workspace.member_role_changed", { role });
  } else if (body?.action === "deactivate" || body?.action === "reactivate") {
    const deactivatedAt = body.action === "deactivate" ? new Date() : null;
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: context.workspace.id, userId } }, data: { deactivatedAt } });
    if (deactivatedAt) await db.session.updateMany({ where: { workspaceId: context.workspace.id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(`workspace.member_${body.action}`, {});
  } else if (body?.action === "remove") {
    await db.$transaction([
      db.projectMember.deleteMany({ where: { userId, project: { workspaceId: context.workspace.id } } }),
      db.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: context.workspace.id, userId } } }),
      db.session.updateMany({ where: { workspaceId: context.workspace.id, userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "workspace.member_removed", targetType: "user", targetId: userId, metadata: {} } }),
    ]);
    return NextResponse.json({ removed: true });
  } else return NextResponse.json({ error: "No supported change was provided." }, { status: 400 });
  return NextResponse.json({ updated: true });

  async function audit(action: string, metadata: Record<string, string>) {
    await db.auditEvent.create({ data: { workspaceId: context!.workspace.id, actorId: context!.user.id, action, targetType: "user", targetId: userId, metadata } });
  }
}
