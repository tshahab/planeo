import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role === "VIEWER") return NextResponse.json({ error: "Viewers cannot comment." }, { status: 403 });
  const { id } = await params;
  const scope = await db.issue.findFirst({ where: { id, workspaceId: context.workspace.id, archivedAt: null }, include: { project: { select: { key: true } } } });
  if (!scope) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  const project = await getProjectForContext(context, scope.project.key);
  const projectMembership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } }, select: { role: true } });
  if (projectMembership?.role === "VIEWER") return NextResponse.json({ error: "Project viewers cannot comment." }, { status: 403 });

  const body = await request.json().catch(() => null) as { body?: unknown } | null;
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text || text.length > 5000) return NextResponse.json({ error: "Comment must contain 1–5,000 characters." }, { status: 400 });
  const comment = await db.$transaction(async (tx) => {
    const created = await tx.comment.create({ data: { issueId: id, authorId: context.user.id, body: text }, include: { author: { select: { id: true, name: true } } } });
    await tx.issueActivity.create({ data: { issueId: id, actorId: context.user.id, action: "comment.added", changes: { commentId: created.id } } });
    return created;
  });
  return NextResponse.json({ comment: { id: comment.id, body: text, createdAt: comment.createdAt, updatedAt: comment.updatedAt, author: comment.author } }, { status: 201 });
}
