import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { validatePermissions } from "@/lib/permissions";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!['OWNER','ADMIN'].includes(context.role)) return NextResponse.json({ error: "Workspace administration is required." }, { status: 403 });
  return NextResponse.json({ schemes: await db.permissionScheme.findMany({ where: { workspaceId: context.workspace.id }, include: { versions: { orderBy: { version: "desc" } } }, orderBy: { name: "asc" } }) });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!['OWNER','ADMIN'].includes(context.role)) return NextResponse.json({ error: "Workspace administration is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) throw new Error("Name must contain 1–100 characters.");
    const permissions = validatePermissions(body?.permissions);
    const scheme = await db.$transaction(async tx => {
      const created = await tx.permissionScheme.create({ data: { workspaceId: context.workspace.id, name, versions: { create: { version: 1, permissions, createdById: context.user.id } } }, include: { versions: true } });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "permission_scheme.created", targetType: "permission_scheme", targetId: created.id, metadata: { version: 1 } } });
      return created;
    });
    return NextResponse.json({ scheme }, { status: 201 });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Scheme could not be created." }, { status: 400 }); }
}
