import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { releaseAccess, releaseDates, releaseView } from "@/lib/releases";
import { enqueueWebhook } from "@/lib/webhooks";

const include = { issues: { include: { issue: { select: { estimate: true, archivedAt: true, dueDate: true, status: { select: { category: true } } } } } } } as const;

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const access = await releaseAccess((await params).key); if (access.error) return access.error; const { project, admin } = access;
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  const releases = await db.release.findMany({ where: { projectId: project.id, ...(archived ? { archivedAt: { not: null } } : { archivedAt: null }) }, include, orderBy: [{ releaseDate: { sort: "asc", nulls: "last" } }, { name: "asc" }] });
  return NextResponse.json({ releases: releases.map(releaseView), canManage: admin });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const access = await releaseAccess((await params).key); if (access.error) return access.error; const { context, project, admin } = access;
  if (!admin) return NextResponse.json({ error: "Project administration is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const name = typeof body?.name === "string" ? body.name.trim() : ""; const description = typeof body?.description === "string" ? body.description.trim() : null; const dates = releaseDates(body ?? {});
  if (name.length < 1 || name.length > 80) return NextResponse.json({ error: "Release name must contain 1–80 characters." }, { status: 400 }); if (description && description.length > 2000) return NextResponse.json({ error: "Description cannot exceed 2,000 characters." }, { status: 400 }); if (dates.error) return NextResponse.json({ error: dates.error }, { status: 400 });
  try { const release = await db.$transaction(async (tx) => { const value = await tx.release.create({ data: { projectId: project.id, name, description, startsAt: dates.startsAt, releaseDate: dates.releaseDate }, include }); await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "release.created", targetType: "release", targetId: value.id, metadata: { projectId: project.id, name } } }); await enqueueWebhook(tx, { workspaceId: context.workspace.id, projectId: project.id, event: "release.created", eventId: `release.created:${value.id}`, data: { id: value.id, name: value.name, version: value.version } }); return value; }); return NextResponse.json({ release: releaseView(release) }, { status: 201 }); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Release names must be unique within this project." }, { status: 409 }); throw error; }
}
