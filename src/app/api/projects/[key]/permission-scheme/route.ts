import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { explainProjectPermission, PROJECT_PERMISSIONS } from "@/lib/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key } = await params, project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key: key.toUpperCase() }, include: { permissionSchemeVersion: { include: { scheme: true } } } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const permission = new URL(request.url).searchParams.get("explain");
  if (permission) { if (!PROJECT_PERMISSIONS.includes(permission as never)) return NextResponse.json({ error: "Permission is invalid." }, { status: 400 }); return NextResponse.json({ explanation: await explainProjectPermission(context, project.id, permission as never) }); }
  if (!await explainProjectPermission(context, project.id, "project.admin").then(value => value.allowed)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ assignment: project.permissionSchemeVersion });
}

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key } = await params, project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key: key.toUpperCase() } });
  if (!project || !await explainProjectPermission(context, project.id, "project.admin").then(value => value.allowed)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as { versionId?: unknown } | null;
  const versionId = typeof body?.versionId === "string" ? body.versionId : null;
  if (versionId && !await db.permissionSchemeVersion.findFirst({ where: { id: versionId, scheme: { workspaceId: context.workspace.id } } })) return NextResponse.json({ error: "Scheme version not found." }, { status: 404 });
  await db.$transaction([db.project.update({ where: { id: project.id }, data: { permissionSchemeVersionId: versionId } }), db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "permission_scheme.assigned", targetType: "project", targetId: project.id, metadata: { from: project.permissionSchemeVersionId, to: versionId } } })]);
  return NextResponse.json({ versionId });
}
