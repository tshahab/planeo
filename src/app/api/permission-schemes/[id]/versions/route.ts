import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { validatePermissions } from "@/lib/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!['OWNER','ADMIN'].includes(context.role)) return NextResponse.json({ error: "Workspace administration is required." }, { status: 403 });
  const { id } = await params, body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    const scheme = await db.permissionScheme.findFirst({ where: { id, workspaceId: context.workspace.id }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!scheme) return NextResponse.json({ error: "Scheme not found." }, { status: 404 });
    const permissions = validatePermissions(body?.permissions), version = (scheme.versions[0]?.version ?? 0) + 1;
    const result = await db.$transaction(async tx => { const created = await tx.permissionSchemeVersion.create({ data: { schemeId: id, version, permissions, createdById: context.user.id } }); await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "permission_scheme.version_created", targetType: "permission_scheme", targetId: id, metadata: { version } } }); return created; });
    return NextResponse.json({ version: result }, { status: 201 });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Version could not be created." }, { status: 400 }); }
}
