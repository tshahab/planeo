import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key: (await params).key.toUpperCase(), template: "SERVICE", archivedAt: null }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ groups: await db.portalGroup.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } }) });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key: (await params).key.toUpperCase(), template: "SERVICE", archivedAt: null }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) return NextResponse.json({ error: "Name must contain 1–100 characters." }, { status: 400 });
  try { const group = await db.portalGroup.create({ data: { projectId: project.id, name, description: typeof body?.description === "string" ? body.description.trim() : null, position: typeof body?.position === "number" ? body.position : 0 } }); return NextResponse.json({ group }, { status: 201 }); }
  catch { return NextResponse.json({ error: "A portal group with this name already exists." }, { status: 409 }); }
}
