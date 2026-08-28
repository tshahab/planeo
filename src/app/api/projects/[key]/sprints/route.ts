import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext, issueInclude } from "@/lib/issue-query";
import { toUiIssue } from "@/lib/issue-mapper";
import { enqueueWebhook } from "@/lib/webhooks";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key } = await params;
  const project = await getProjectForContext(context, key);
  const [sprints, backlog] = await Promise.all([
    db.sprint.findMany({
      where: { projectId: project.id },
      include: { issues: { orderBy: { position: "asc" }, include: { issue: { include: issueInclude } } } },
      orderBy: [{ state: "asc" }, { position: "asc" }],
    }),
    db.issue.findMany({
      where: { projectId: project.id, parentId: null, archivedAt: null, sprintIssues: { none: { sprint: { state: { in: ["PLANNED", "ACTIVE"] } } } } },
      include: issueInclude,
      orderBy: { rank: "asc" },
    }),
  ]);
  const wipLimits = await db.boardColumn.findMany({ where: { board: { projectId: project.id }, wipLimit: { not: null } }, select: { name: true, wipLimit: true, status: { select: { _count: { select: { issues: { where: { archivedAt: null } } } } } } } });
  return NextResponse.json({
    backlog: backlog.map((issue) => toUiIssue(issue, project.key)),
    sprints: sprints.map((sprint) => ({ ...sprint, issueCount: sprint.issues.length, estimateTotal: sprint.issues.reduce((sum, { issue }) => sum + (issue.estimate ?? 0), 0), issues: sprint.issues.map(({ issue }) => toUiIssue(issue, project.key)) })),
    wipLimits: wipLimits.map((column) => ({ name: column.name, limit: column.wipLimit, count: column.status._count.issues })),
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
  const body = await request.json().catch(() => null) as { name?: unknown; goal?: unknown; startsAt?: unknown; endsAt?: unknown; capacityTarget?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
  if (!name || name.length > 100 || goal.length > 500) return NextResponse.json({ error: "Use a sprint name of 1–100 characters and a goal of at most 500 characters." }, { status: 400 });
  const startsAt = date(body?.startsAt); const endsAt = date(body?.endsAt); const capacityTarget = integer(body?.capacityTarget, 0, 10000);
  if (body?.startsAt && !startsAt || body?.endsAt && !endsAt || body?.capacityTarget != null && capacityTarget == null || startsAt && endsAt && startsAt >= endsAt) return NextResponse.json({ error: "Dates or capacity target are invalid." }, { status: 400 });
  const last = await db.sprint.aggregate({ where: { projectId: project.id, state: "PLANNED" }, _max: { position: true } });
  const sprint = await db.$transaction(async tx => { const value = await tx.sprint.create({ data: { projectId: project.id, name, goal: goal || null, startsAt, endsAt, capacityTarget, position: (last._max.position ?? -1) + 1 } }); await enqueueWebhook(tx, { workspaceId: context.workspace.id, projectId: project.id, event: "sprint.created", eventId: `sprint.created:${value.id}`, data: { id: value.id, name: value.name, version: value.version } }); return value; });
  return NextResponse.json({ sprint: { ...sprint, issues: [] } }, { status: 201 });
}

function date(value: unknown) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const result = new Date(`${value}T12:00:00.000Z`); return Number.isNaN(result.getTime()) ? null : result; }
function integer(value: unknown, min: number, max: number) { if (value === undefined || value === null || value === "") return null; const result = Number(value); return Number.isInteger(result) && result >= min && result <= max ? result : null; }
