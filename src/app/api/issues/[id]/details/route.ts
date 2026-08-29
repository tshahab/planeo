import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";
import { issueInclude } from "@/lib/issue-query";
import { toUiIssue } from "@/lib/issue-mapper";
import { attachmentDownloadUrl } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const scope = await db.issue.findFirst({ where: { id, workspaceId: context.workspace.id, archivedAt: null }, include: { project: { select: { key: true } } } });
  if (!scope) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  await getProjectForContext(context, scope.project.key);
  await db.recentIssueView.upsert({ where: { userId_issueId: { userId: context.user.id, issueId: id } }, update: { workspaceId: context.workspace.id }, create: { userId: context.user.id, issueId: id, workspaceId: context.workspace.id } });

  const [comments, activities, attachments, subtasks, development] = await Promise.all([
    db.comment.findMany({ where: { issueId: id, deletedAt: null }, include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    db.issueActivity.findMany({ where: { issueId: id, action: { not: "comment.added" } }, include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.attachment.findMany({ where: { issueId: id }, select: { id: true, fileName: true, contentType: true, size: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    db.issue.findMany({ where: { parentId: id, archivedAt: null }, include: issueInclude, orderBy: { number: "asc" } }),
    db.developmentActivity.findMany({ where: { issueId: id, issue: { workspaceId: context.workspace.id } }, include: { repository: { select: { fullName: true, webUrl: true, accessible: true, connection: { select: { provider: true } } } } }, orderBy: { externalUpdatedAt: "desc" } }),
  ]);
  return NextResponse.json({
    comments: comments.map((item) => ({ id: item.id, body: typeof item.body === "string" ? item.body : "", createdAt: item.createdAt, updatedAt: item.updatedAt, author: item.author })),
    activities: activities.map((item) => ({ id: item.id, action: item.action, changes: item.changes, createdAt: item.createdAt, actor: item.actor })),
    attachments: attachments.map((item) => ({ ...item, downloadUrl: attachmentDownloadUrl(context.workspace.id, item.id) })),
    subtasks: subtasks.map((item) => toUiIssue(item, scope.project.key)),
    development,
  });
}
