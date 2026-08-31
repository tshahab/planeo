import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";
import { canViewIssue } from "@/lib/permissions";

async function authorizedIssue(id: string, workspaceId: string, context: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>) {
  const issue = await db.issue.findFirst({ where: { id, workspaceId, archivedAt: null }, include: { project: { select: { key: true } } } });
  if (!issue || !await canViewIssue(context, id)) return null;
  const project = await getProjectForContext(context, issue.project.key).catch(() => null);
  if (!project) return null;
  return issue;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params; const issue = await authorizedIssue(id, context.workspace.id, context);
  if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  const watcher = await db.issueWatcher.findUnique({ where: { issueId_userId: { issueId: id, userId: context.user.id } } });
  return NextResponse.json({ watching: Boolean(watcher) });
}

export async function PUT(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params; const issue = await authorizedIssue(id, context.workspace.id, context);
  if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  await db.issueWatcher.upsert({ where: { issueId_userId: { issueId: id, userId: context.user.id } }, update: {}, create: { issueId: id, userId: context.user.id } });
  return NextResponse.json({ watching: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params; const issue = await authorizedIssue(id, context.workspace.id, context);
  if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  await db.issueWatcher.deleteMany({ where: { issueId: id, userId: context.user.id } });
  return NextResponse.json({ watching: false });
}
