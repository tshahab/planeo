import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { toUiIssue } from "@/lib/issue-mapper";
import { getProjectForContext, issueInclude } from "@/lib/issue-query";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role === "VIEWER") return NextResponse.json({ error: "Viewers cannot create subtasks." }, { status: 403 });
  const { id } = await params;
  const parent = await db.issue.findFirst({ where: { id, workspaceId: context.workspace.id, archivedAt: null, parentId: null }, include: { project: { select: { key: true } } } });
  if (!parent) return NextResponse.json({ error: "Parent issue not found." }, { status: 404 });
  const project = await getProjectForContext(context, parent.project.key);
  const membership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } }, select: { role: true } });
  if (membership?.role === "VIEWER") return NextResponse.json({ error: "Project viewers cannot create subtasks." }, { status: 403 });
  const body = await request.json().catch(() => null) as { title?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 200) return NextResponse.json({ error: "Subtask title must contain 1–200 characters." }, { status: 400 });
  const [status, issueType] = await Promise.all([
    db.status.findFirstOrThrow({ where: { projectId: project.id, name: "To do" } }),
    db.issueType.findFirstOrThrow({ where: { projectId: project.id, kind: "SUBTASK" } }),
  ]);
  const subtask = await db.$transaction(async (tx) => {
    const sequence = await tx.project.update({ where: { id: project.id }, data: { issueSequence: { increment: 1 } }, select: { issueSequence: true } });
    const created = await tx.issue.create({ data: { workspaceId: project.workspaceId, projectId: project.id, number: sequence.issueSequence, issueTypeId: issueType.id, statusId: status.id, reporterId: context.user.id, parentId: id, summary: title, description: "", priority: parent.priority, rank: `a${Date.now().toString(36)}` }, include: issueInclude });
    await tx.issueActivity.create({ data: { issueId: id, actorId: context.user.id, action: "subtask.created", changes: { subtaskId: created.id, title } } });
    return created;
  });
  return NextResponse.json({ subtask: toUiIssue(subtask, project.key) }, { status: 201 });
}
