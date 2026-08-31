import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";
import { createIssueNotifications, mentionedEmails } from "@/lib/notifications";
import { enqueueWebhook } from "@/lib/webhooks";
import { canViewIssue, requireProjectPermission } from "@/lib/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const scope = await db.issue.findFirst({ where: { id, workspaceId: context.workspace.id, archivedAt: null }, include: { project: { select: { key: true } }, watchers: { select: { userId: true } } } });
  if (!scope || !await canViewIssue(context, id)) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  const project = await getProjectForContext(context, scope.project.key);
  if (!await requireProjectPermission(context, project.id, "issue.edit")) return NextResponse.json({ error: "Issue not found." }, { status: 404 });

  const body = await request.json().catch(() => null) as { body?: unknown } | null;
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text || text.length > 5000) return NextResponse.json({ error: "Comment must contain 1–5,000 characters." }, { status: 400 });
  const mentioned = await db.user.findMany({ where: { email: { in: mentionedEmails(text), mode: "insensitive" }, memberships: { some: { workspaceId: context.workspace.id } }, OR: [{ projectRoles: { some: { projectId: project.id } } }, ...(project.visibility === "PUBLIC" ? [{}] : [])] }, select: { id: true } });
  const comment = await db.$transaction(async (tx) => {
    const created = await tx.comment.create({ data: { issueId: id, authorId: context.user.id, body: text }, include: { author: { select: { id: true, name: true } } } });
    await tx.issueActivity.create({ data: { issueId: id, actorId: context.user.id, action: "comment.added", changes: { commentId: created.id } } });
    const base = { workspaceId: context.workspace.id, issueId: id, issueKey: `${scope.project.key}-${scope.number}`, issueTitle: scope.summary, actorId: context.user.id, eventId: created.id };
    await createIssueNotifications(tx, { ...base, type: "COMMENTED", recipientIds: [...scope.watchers.map(({ userId }) => userId), ...(scope.assigneeId ? [scope.assigneeId] : [])] });
    await createIssueNotifications(tx, { ...base, type: "MENTIONED", recipientIds: mentioned.map(({ id: userId }) => userId) });
    await enqueueWebhook(tx, { workspaceId: context.workspace.id, projectId: project.id, event: "comment.created", eventId: `comment.created:${created.id}`, data: { id: created.id, issueId: id, issueKey: `${scope.project.key}-${scope.number}` } });
    return created;
  });
  return NextResponse.json({ comment: { id: comment.id, body: text, createdAt: comment.createdAt, updatedAt: comment.updatedAt, author: comment.author } }, { status: 201 });
}
