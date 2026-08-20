import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role === "VIEWER") return NextResponse.json({ error: "Viewers cannot reorder the backlog." }, { status: 403 });
  const { key } = await params;
  const project = await getProjectForContext(context, key);
  const member = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } } });
  if (member?.role === "VIEWER") return NextResponse.json({ error: "Project viewers cannot reorder the backlog." }, { status: 403 });
  const body = await request.json().catch(() => null) as { issueIds?: unknown } | null;
  if (!Array.isArray(body?.issueIds) || body.issueIds.some((value) => typeof value !== "string")) return NextResponse.json({ error: "Issue order is invalid." }, { status: 400 });
  const ids = body.issueIds as string[];
  const count = await db.issue.count({ where: { id: { in: ids }, projectId: project.id, archivedAt: null, sprintIssues: { none: { sprint: { state: { in: ["PLANNED", "ACTIVE"] } } } } } });
  if (count !== ids.length || new Set(ids).size !== ids.length) return NextResponse.json({ error: "Issue order contains invalid entries." }, { status: 400 });
  await db.$transaction(ids.map((id, position) => db.issue.update({ where: { id }, data: { rank: position.toString().padStart(8, "0") } })));
  return NextResponse.json({ ok: true });
}
