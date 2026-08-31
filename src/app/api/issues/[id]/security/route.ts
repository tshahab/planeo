import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewIssue, explainProjectPermission } from "@/lib/permissions";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params, issue = await db.issue.findFirst({ where: { id, workspaceId: context.workspace.id, archivedAt: null }, select: { id: true, projectId: true, securityLevelId: true } });
  if (!issue || !await canViewIssue(context, id) || !(await explainProjectPermission(context, issue.projectId, "issue.security")).allowed) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as { securityLevelId?: unknown } | null, securityLevelId = typeof body?.securityLevelId === "string" ? body.securityLevelId : null;
  if (securityLevelId && !await db.issueSecurityLevel.findFirst({ where: { id: securityLevelId, projectId: issue.projectId } })) return NextResponse.json({ error: "Security level not found." }, { status: 404 });
  await db.$transaction([db.issue.update({ where: { id }, data: { securityLevelId, version: { increment: 1 } } }), db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "issue.security_changed", targetType: "issue", targetId: id, metadata: { from: issue.securityLevelId, to: securityLevelId } } })]);
  return NextResponse.json({ securityLevelId });
}
