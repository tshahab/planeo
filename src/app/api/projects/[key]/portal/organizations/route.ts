import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); const key = (await params).key.toUpperCase();
  const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key, template: "SERVICE", archivedAt: null }, select: { id: true } });
  if (!project || !await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ organizations: await db.customerOrganization.findMany({ where: { workspaceId: context.workspace.id, projects: { some: { projectId: project.id } } }, include: { _count: { select: { members: true } } }, orderBy: { name: "asc" } }) });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); const key = (await params).key.toUpperCase();
  const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key, template: "SERVICE", archivedAt: null }, select: { id: true } });
  if (!project || !await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const name = typeof body?.name === "string" ? body.name.trim() : ""; if (!name || name.length > 100) return NextResponse.json({ error: "Name must contain 1–100 characters." }, { status: 400 });
  try { const organization = await db.customerOrganization.create({ data: { workspaceId: context.workspace.id, name, projects: { create: { projectId: project.id } } } }); return NextResponse.json({ organization }, { status: 201 }); }
  catch { return NextResponse.json({ error: "A customer organization with this name already exists." }, { status: 409 }); }
}
