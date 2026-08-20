import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role === "VIEWER") return NextResponse.json({ error: "Viewers cannot manage sprints." }, { status: 403 });
  const { key, id } = await params;
  const project = await getProjectForContext(context, key);
  const member = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } } });
  if (member?.role === "VIEWER") return NextResponse.json({ error: "Project viewers cannot manage sprints." }, { status: 403 });
  const sprint = await db.sprint.findFirst({ where: { id, projectId: project.id }, include: { issues: true } });
  if (!sprint) return NextResponse.json({ error: "Sprint not found." }, { status: 404 });
  if (sprint.state === "COMPLETED") return NextResponse.json({ error: "Completed sprints are immutable." }, { status: 409 });
  const body = await request.json().catch(() => null) as { action?: unknown; issueId?: unknown; issueIds?: unknown } | null;
  const action = body?.action;

  if (action === "start") {
    if (sprint.state !== "PLANNED") return NextResponse.json({ error: "Only planned sprints can start." }, { status: 409 });
    const active = await db.sprint.findFirst({ where: { projectId: project.id, state: "ACTIVE" } });
    if (active) return NextResponse.json({ error: "Complete the active sprint before starting another." }, { status: 409 });
    await db.sprint.update({ where: { id }, data: { state: "ACTIVE", startsAt: new Date() } });
  } else if (action === "complete") {
    if (sprint.state !== "ACTIVE") return NextResponse.json({ error: "Only the active sprint can be completed." }, { status: 409 });
    const completedIssueCount = await db.sprintIssue.count({ where: { sprintId: id, issue: { status: { category: "DONE" } } } });
    await db.sprint.update({ where: { id }, data: { state: "COMPLETED", endsAt: new Date(), completedAt: new Date(), totalIssueCount: sprint.issues.length, completedIssueCount } });
  } else if (action === "add" || action === "remove") {
    if (typeof body?.issueId !== "string") return NextResponse.json({ error: "Issue is required." }, { status: 400 });
    const issue = await db.issue.findFirst({ where: { id: body.issueId, projectId: project.id, archivedAt: null } });
    if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    if (action === "remove") await db.sprintIssue.deleteMany({ where: { sprintId: id, issueId: issue.id } });
    else await db.$transaction(async (tx) => {
      await tx.sprintIssue.deleteMany({ where: { issueId: issue.id, sprint: { state: { in: ["PLANNED", "ACTIVE"] } } } });
      const last = await tx.sprintIssue.aggregate({ where: { sprintId: id }, _max: { position: true } });
      await tx.sprintIssue.create({ data: { sprintId: id, issueId: issue.id, position: (last._max.position ?? -1) + 1 } });
    });
  } else if (action === "reorder") {
    if (!Array.isArray(body?.issueIds) || body.issueIds.some((value) => typeof value !== "string")) return NextResponse.json({ error: "Issue order is invalid." }, { status: 400 });
    const ids = body.issueIds as string[];
    const count = await db.sprintIssue.count({ where: { sprintId: id, issueId: { in: ids } } });
    if (count !== ids.length || new Set(ids).size !== ids.length) return NextResponse.json({ error: "Issue order contains invalid entries." }, { status: 400 });
    await db.$transaction(ids.map((issueId, position) => db.sprintIssue.update({ where: { sprintId_issueId: { sprintId: id, issueId } }, data: { position } })));
  } else return NextResponse.json({ error: "Unsupported sprint action." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
