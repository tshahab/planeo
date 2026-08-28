import { NextResponse } from "next/server";
import { db } from "./db";
import { getAuthContext } from "./auth";
import { getProjectForContext } from "./issue-query";

export function releaseDates(input: { startsAt?: unknown; releaseDate?: unknown }) {
  const parse = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : value == null || value === "" ? null : undefined;
  const startsAt = parse(input.startsAt); const releaseDate = parse(input.releaseDate);
  if (startsAt === undefined || releaseDate === undefined || startsAt && releaseDate && startsAt > releaseDate) return { error: "Dates must use YYYY-MM-DD and the release date cannot precede the start date." };
  return { startsAt, releaseDate };
}

export async function releaseAccess(key: string) {
  const context = await getAuthContext();
  if (!context) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const project = await getProjectForContext(context, key).catch(() => null);
  if (!project) return { error: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  const member = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } }, select: { role: true } });
  return { context, project, admin: context.role === "OWNER" || context.role === "ADMIN" || member?.role === "ADMIN" };
}

export function releaseView(release: { issues: Array<{ issue: { estimate: number | null; archivedAt: Date | null; dueDate: Date | null; status: { category: string } } }>; releaseDate: Date | null; [key: string]: unknown }) {
  const issues = release.issues.map(({ issue }) => issue).filter((issue) => !issue.archivedAt); const unresolved = issues.filter((issue) => issue.status.category !== "DONE");
  const totalEstimate = issues.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0); const completedEstimate = issues.filter((issue) => issue.status.category === "DONE").reduce((sum, issue) => sum + (issue.estimate ?? 0), 0);
  return { ...release, issues: undefined, issueCount: issues.length, completedCount: issues.length - unresolved.length, unresolvedCount: unresolved.length, totalEstimate, completedEstimate, completionPercent: issues.length ? Math.round((issues.length - unresolved.length) / issues.length * 100) : 0, overdue: Boolean(release.releaseDate && release.releaseDate < new Date() && unresolved.length) };
}
