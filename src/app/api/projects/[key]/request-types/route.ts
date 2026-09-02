import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleProjectWhere } from "@/lib/project-query";
import { assertPortalSchemaReferences } from "@/lib/service-requests";
import { requireProjectPermission } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key } = await params;
  const project = await db.project.findFirst({ where: { ...accessibleProjectWhere(context), key: key.toUpperCase(), template: "SERVICE" }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ requestTypes: await db.serviceRequestType.findMany({ where: { projectId: project.id }, include: { portalGroup: true, versions: { orderBy: { version: "desc" } } }, orderBy: { position: "asc" } }) });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key } = await params;
  const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key: key.toUpperCase(), template: "SERVICE", archivedAt: null }, include: { issueTypes: true, statuses: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) return NextResponse.json({ error: "Name must contain 1–100 characters." }, { status: 400 });
  const issueTypeId = typeof body?.issueTypeId === "string" ? body.issueTypeId : project.issueTypes[0]?.id;
  const initialStatusId = typeof body?.initialStatusId === "string" ? body.initialStatusId : project.statuses.sort((a, b) => a.position - b.position)[0]?.id;
  if (!project.issueTypes.some(({ id }) => id === issueTypeId) || !project.statuses.some(({ id }) => id === initialStatusId)) return NextResponse.json({ error: "Issue type and workflow status must belong to this project." }, { status: 400 });
  try {
    const created = await db.$transaction(async (tx) => {
      const schema = await assertPortalSchemaReferences(tx, context.workspace.id, project.id, body?.schema ?? { fields: [] });
      const portalGroupId = typeof body?.portalGroupId === "string" ? body.portalGroupId : null;
      if (portalGroupId && !await tx.portalGroup.count({ where: { id: portalGroupId, projectId: project.id, archivedAt: null } })) throw new Error("Portal group must belong to this project.");
      const result = await tx.serviceRequestType.create({ data: { projectId: project.id, portalGroupId, issueTypeId: issueTypeId!, initialStatusId: initialStatusId!, name, description: typeof body?.description === "string" ? body.description.trim() : null, icon: typeof body?.icon === "string" ? body.icon.slice(0, 50) : null, position: typeof body?.position === "number" ? body.position : 0, draftSchema: schema as never, draftConsentText: typeof body?.consentText === "string" ? body.consentText.trim() : null } });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "service.request_type.created", targetType: "serviceRequestType", targetId: result.id, metadata: { projectId: project.id } } });
      return result;
    });
    return NextResponse.json({ requestType: created }, { status: 201 });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Request type could not be created." }, { status: 400 }); }
}
