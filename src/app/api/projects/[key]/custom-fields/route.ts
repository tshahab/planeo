import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";

async function scope(key: string) { const context = await getAuthContext(); if (!context) return null; const project = await getProjectForContext(context, key).catch(() => null); return project ? { context, project } : null; }
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const result = await scope((await params).key); if (!result) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const fields = await db.customFieldProject.findMany({ where: { projectId: result.project.id, field: { workspaceId: result.context.workspace.id } }, include: { field: true }, orderBy: { position: "asc" } });
  return NextResponse.json({ fields });
}
export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const result = await scope((await params).key); if (!result) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const { context, project } = result; const membership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } } });
  if (!(["OWNER", "ADMIN"].includes(context.role) || membership?.role === "ADMIN")) return NextResponse.json({ error: "Project administration is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { fieldId?: unknown; required?: unknown; issueTypeIds?: unknown; position?: unknown; enabled?: unknown } | null;
  if (!body || typeof body.fieldId !== "string") return NextResponse.json({ error: "A stable field ID is required." }, { status: 400 });
  const field = await db.customField.findFirst({ where: { id: body.fieldId, workspaceId: context.workspace.id, archivedAt: null } }); if (!field) return NextResponse.json({ error: "Active custom field not found in this workspace." }, { status: 404 });
  if (body.enabled === false) { await db.customFieldProject.deleteMany({ where: { fieldId: field.id, projectId: project.id } }); return NextResponse.json({ configured: false }); }
  const issueTypeIds = Array.isArray(body.issueTypeIds) ? body.issueTypeIds.filter((id): id is string => typeof id === "string") : [];
  const count = await db.issueType.count({ where: { projectId: project.id, id: { in: issueTypeIds } } }); if (count !== issueTypeIds.length) return NextResponse.json({ error: "Issue types must belong to this project." }, { status: 400 });
  if (field.type === "USER" && typeof field.defaultValue === "string") { const user = await db.workspaceMember.findFirst({ where: { workspaceId: context.workspace.id, userId: field.defaultValue, deactivatedAt: null } }); if (!user) return NextResponse.json({ error: "Default user is not an active workspace member." }, { status: 400 }); }
  const configuration = await db.customFieldProject.upsert({ where: { fieldId_projectId: { fieldId: field.id, projectId: project.id } }, update: { required: body.required === true, issueTypeIds: issueTypeIds as Prisma.InputJsonValue, position: Number.isInteger(body.position) ? Number(body.position) : 0 }, create: { fieldId: field.id, projectId: project.id, required: body.required === true, issueTypeIds: issueTypeIds as Prisma.InputJsonValue, position: Number.isInteger(body.position) ? Number(body.position) : 0 } });
  await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "custom_field.configured", targetType: "project", targetId: project.id, metadata: { fieldId: field.id, required: configuration.required, issueTypeIds } } });
  return NextResponse.json({ configuration });
}
