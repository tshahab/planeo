import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role !== "OWNER" && context.role !== "ADMIN") return NextResponse.json({ error: "Workspace administration is required." }, { status: 403 });
  const { id } = await params; const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const existing = await db.customField.findFirst({ where: { id, workspaceId: context.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Custom field not found." }, { status: 404 });
  const data: Prisma.CustomFieldUpdateInput = {};
  if (body?.name !== undefined) { const name = typeof body.name === "string" ? body.name.trim() : ""; if (!name || name.length > 100) return NextResponse.json({ error: "Field name must contain 1–100 characters." }, { status: 400 }); data.name = name; }
  if (body?.description !== undefined) data.description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : null;
  if (body?.action === "archive") data.archivedAt = new Date();
  if (body?.action === "restore") data.archivedAt = null;
  if (!Object.keys(data).length) return NextResponse.json({ error: "No supported changes were provided." }, { status: 400 });
  const field = await db.customField.update({ where: { id }, data });
  await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: body?.action === "archive" ? "custom_field.archived" : "custom_field.updated", targetType: "custom_field", targetId: id, metadata: { stableId: id } } });
  return NextResponse.json({ field });
}
