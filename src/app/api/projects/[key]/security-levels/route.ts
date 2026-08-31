import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { explainProjectPermission, validateSecurityGrants } from "@/lib/permissions";

async function access(key: string) { const context = await getAuthContext(); if (!context) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) }; const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key: key.toUpperCase() } }); if (!project || !(await explainProjectPermission(context, project.id, "issue.security")).allowed) return { error: NextResponse.json({ error: "Project not found." }, { status: 404 }) }; return { context, project }; }
export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) { const { key } = await params, result = await access(key); if (result.error) return result.error; return NextResponse.json({ levels: await db.issueSecurityLevel.findMany({ where: { projectId: result.project!.id }, orderBy: { name: "asc" } }) }); }
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params, result = await access(key); if (result.error) return result.error; const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try { const name = typeof body?.name === "string" ? body.name.trim() : "", description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) : null; if (!name || name.length > 100) throw new Error("Name must contain 1–100 characters."); const grants = validateSecurityGrants(body?.grants);
    const organizationId = await db.workspace.findUnique({ where: { id: result.context!.workspace.id }, select: { organizationId: true } }).then(value => value?.organizationId);
    if (grants.groupIds?.length && (!organizationId || await db.organizationGroup.count({ where: { id: { in: grants.groupIds }, organizationId } }) !== grants.groupIds.length)) throw new Error("Every group must belong to this organization.");
    if (grants.userIds?.length && await db.workspaceMember.count({ where: { workspaceId: result.context!.workspace.id, userId: { in: grants.userIds }, deactivatedAt: null } }) !== grants.userIds.length) throw new Error("Every user must be an active workspace member.");
    const level = await db.$transaction(async tx => { const created = await tx.issueSecurityLevel.create({ data: { projectId: result.project!.id, name, description, grants } }); await tx.auditEvent.create({ data: { workspaceId: result.context!.workspace.id, actorId: result.context!.user.id, action: "issue_security.created", targetType: "issue_security_level", targetId: created.id, metadata: { projectId: result.project!.id } } }); return created; }); return NextResponse.json({ level }, { status: 201 });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Security level could not be created." }, { status: 400 }); }
}
