import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key, id } = await params;
  const group = await db.portalGroup.findFirst({ where: { id, project: { workspaceId: context.workspace.id, key: key.toUpperCase(), template: "SERVICE", archivedAt: null } }, select: { id: true, projectId: true } });
  if (!group || !await requireProjectPermission(context, group.projectId, "project.admin")) return NextResponse.json({ error: "Portal group not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || body.name !== undefined && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100)) return NextResponse.json({ error: "Use a valid portal group update." }, { status: 400 });
  try { const updated = await db.portalGroup.update({ where: { id }, data: { ...(typeof body.name === "string" ? { name: body.name.trim() } : {}), ...(body.description === null || typeof body.description === "string" ? { description: typeof body.description === "string" ? body.description.trim() : null } : {}), ...(typeof body.position === "number" && Number.isInteger(body.position) ? { position: body.position } : {}), ...(body.archived === true ? { archivedAt: new Date() } : body.archived === false ? { archivedAt: null } : {}) } }); return NextResponse.json({ group: updated }); }
  catch { return NextResponse.json({ error: "Portal group could not be updated." }, { status: 409 }); }
}
