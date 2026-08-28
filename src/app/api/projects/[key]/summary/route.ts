import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key } = await params;
  const project = await getProjectForContext(context, key).catch(() => null);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const [statuses, grouped, sprint, releases] = await Promise.all([
    db.status.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" }, select: { id: true, name: true, color: true, category: true } }),
    db.issue.groupBy({ by: ["statusId"], where: { projectId: project.id, workspaceId: context.workspace.id, archivedAt: null, parentId: null }, _count: { _all: true }, _sum: { estimate: true } }),
    db.sprint.findFirst({ where: { projectId: project.id, state: "ACTIVE" }, orderBy: { startsAt: "desc" }, include: { issues: { where: { issue: { archivedAt: null } }, include: { issue: { select: { estimate: true, status: { select: { category: true } } } } } } } }),
    db.release.findMany({ where: { projectId: project.id, archivedAt: null, status: "PLANNED" }, orderBy: { releaseDate: { sort: "asc", nulls: "last" } }, take: 5, include: { issues: { where: { issue: { archivedAt: null } }, include: { issue: { select: { estimate: true, status: { select: { category: true } } } } } } } }),
  ]);
  const counts = new Map(grouped.map((item) => [item.statusId, item]));
  const sprintIssues = sprint?.issues ?? [];
  return NextResponse.json({
    statuses: statuses.map((status) => ({ ...status, issueCount: counts.get(status.id)?._count._all ?? 0, estimateTotal: counts.get(status.id)?._sum.estimate ?? 0 })),
    sprint: sprint ? {
      id: sprint.id, name: sprint.name, goal: sprint.goal, endsAt: sprint.endsAt,
      issueCount: sprintIssues.length,
      completedCount: sprintIssues.filter(({ issue }) => issue.status.category === "DONE").length,
      estimateTotal: sprintIssues.reduce((sum, { issue }) => sum + (issue.estimate ?? 0), 0),
      completedEstimate: sprintIssues.filter(({ issue }) => issue.status.category === "DONE").reduce((sum, { issue }) => sum + (issue.estimate ?? 0), 0),
    } : null,
    releases: releases.map((release) => ({ id: release.id, name: release.name, releaseDate: release.releaseDate, issueCount: release.issues.length, unresolvedCount: release.issues.filter(({ issue }) => issue.status.category !== "DONE").length, estimateTotal: release.issues.reduce((sum, { issue }) => sum + (issue.estimate ?? 0), 0) })),
  });
}
