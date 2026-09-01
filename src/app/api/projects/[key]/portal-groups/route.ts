import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key: (await params).key.toUpperCase(), template: "SERVICE", archivedAt: null } });
  if (!project || !await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 100) return NextResponse.json({ error: "Portal group name must contain 2–100 characters." }, { status: 400 });
  const position = await db.portalGroup.count({ where: { projectId: project.id } });
  const group = await db.portalGroup.create({ data: { projectId: project.id, name, description: typeof body?.description === "string" ? body.description.trim().slice(0, 500) : null, position } });
  return NextResponse.json({ group }, { status: 201 });
}
