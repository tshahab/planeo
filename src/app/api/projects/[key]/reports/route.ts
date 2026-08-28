import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";
import { burndown, cumulativeFlow } from "@/lib/delivery-reports";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); const project = await getProjectForContext(context, (await params).key).catch(() => null); if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const search = new URL(request.url).searchParams; const to = parseDay(search.get("to")) ?? endOfUtcDay(new Date()); const from = parseDay(search.get("from")) ?? new Date(to.getTime() - 29 * 86_400_000); if (from > to || to.getTime() - from.getTime() > 89 * 86_400_000) return NextResponse.json({ error: "Choose a valid UTC date range of at most 90 days." }, { status: 400 });
  const [histories, completed, active] = await Promise.all([
    db.issueHistory.findMany({ where: { projectId: project.id, workspaceId: context.workspace.id, occurredAt: { lte: to }, issue: { archivedAt: null } }, orderBy: { occurredAt: "asc" }, take: 100_000 }),
    db.sprint.findMany({ where: { projectId: project.id, state: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 12, select: { id: true, name: true, completedAt: true, totalIssueCount: true, completedIssueCount: true, totalEstimate: true, completedEstimate: true, snapshotIssues: { select: { estimate: true } } } }),
    db.sprint.findFirst({ where: { projectId: project.id, state: "ACTIVE" }, include: { issues: { include: { issue: { select: { id: true, estimate: true } } } } } }),
  ]);
  const history = histories.map((value) => ({ ...value, statusCategory: value.statusCategory })); const activeHistory = active ? history.filter((value) => value.sprintId === active.id || active.issues.some(({ issueId }) => issueId === value.issueId)) : [];
  const memberships = active ? new Map(active.issues.map(({ issue, addedAt }) => [issue.id, { issueId: issue.id, addedAt, estimate: issue.estimate }])) : new Map<string, { issueId: string; addedAt: Date; estimate: number | null }>(); for (const value of activeHistory.filter(({ event }) => event === "SPRINT_ADDED")) if (!memberships.has(value.issueId)) memberships.set(value.issueId, { issueId: value.issueId, addedAt: value.occurredAt, estimate: value.estimate });
  return NextResponse.json({
    rules: { timezone: "UTC", dayBoundary: "00:00–23:59:59.999 UTC", reopened: "A reopened issue returns to its latest non-done category.", unestimated: "Counted as work but contributes zero estimate points.", archived: "Excluded from current flow; retained in completed sprint snapshots." },
    range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    burndown: active ? { sprint: { id: active.id, name: active.name, startsAt: active.startsAt, endsAt: active.endsAt }, points: burndown({ startsAt: active.startsAt ?? active.createdAt, endsAt: active.endsAt ?? to, histories: activeHistory, memberships: [...memberships.values()] }) } : null,
    velocity: completed.reverse().map((sprint) => ({ id: sprint.id, name: sprint.name, completedAt: sprint.completedAt, issueCount: sprint.totalIssueCount ?? 0, completedIssueCount: sprint.completedIssueCount ?? 0, estimate: sprint.totalEstimate ?? 0, completedEstimate: sprint.completedEstimate ?? 0, unestimated: sprint.snapshotIssues.filter(({ estimate }) => estimate == null).length })),
    cumulativeFlow: cumulativeFlow(history, from, to),
  });
}
function parseDay(value: string | null) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const date = new Date(`${value}T00:00:00.000Z`); return Number.isNaN(date.getTime()) ? null : date; }
function endOfUtcDay(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999)); }
