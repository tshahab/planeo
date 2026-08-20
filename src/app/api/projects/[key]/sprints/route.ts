import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext, issueInclude } from "@/lib/issue-query";
import { toUiIssue } from "@/lib/issue-mapper";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key } = await params;
  const project = await getProjectForContext(context, key);
  const [sprints, backlog] = await Promise.all([
    db.sprint.findMany({
      where: { projectId: project.id },
      include: { issues: { orderBy: { position: "asc" }, include: { issue: { include: issueInclude } } } },
      orderBy: [{ state: "asc" }, { createdAt: "desc" }],
    }),
    db.issue.findMany({
      where: { projectId: project.id, parentId: null, archivedAt: null, sprintIssues: { none: { sprint: { state: { in: ["PLANNED", "ACTIVE"] } } } } },
      include: issueInclude,
      orderBy: { rank: "asc" },
    }),
  ]);
  return NextResponse.json({
    backlog: backlog.map((issue) => toUiIssue(issue, project.key)),
    sprints: sprints.map((sprint) => ({ ...sprint, issues: sprint.issues.map(({ issue }) => toUiIssue(issue, project.key)) })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role === "VIEWER") return NextResponse.json({ error: "Viewers cannot create sprints." }, { status: 403 });
  const { key } = await params;
  const project = await getProjectForContext(context, key);
  const member = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } } });
  if (member?.role === "VIEWER") return NextResponse.json({ error: "Project viewers cannot create sprints." }, { status: 403 });
  const body = await request.json().catch(() => null) as { name?: unknown; goal?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
  if (!name || name.length > 100 || goal.length > 500) return NextResponse.json({ error: "Use a sprint name of 1–100 characters and a goal of at most 500 characters." }, { status: 400 });
  const sprint = await db.sprint.create({ data: { projectId: project.id, name, goal: goal || null } });
  return NextResponse.json({ sprint: { ...sprint, issues: [] } }, { status: 201 });
}
