import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertPortalSchemaReferences } from "@/lib/service-requests";
import { requireProjectPermission } from "@/lib/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key, id } = await params;
  const current = await db.serviceRequestType.findFirst({ where: { id, project: { workspaceId: context.workspace.id, key: key.toUpperCase(), template: "SERVICE" } }, include: { project: { include: { issueTypes: true, statuses: true } } } });
  if (!current) return NextResponse.json({ error: "Request type not found." }, { status: 404 });
  if (!await requireProjectPermission(context, current.projectId, "project.admin")) return NextResponse.json({ error: "Request type not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100)) return NextResponse.json({ error: "Name must contain 1–100 characters." }, { status: 400 });
  try {
    const result = await db.$transaction(async (tx) => {
      const schema = body.schema === undefined ? current.draftSchema : await assertPortalSchemaReferences(tx, context.workspace.id, current.projectId, body.schema);
      const issueTypeId = typeof body.issueTypeId === "string" ? body.issueTypeId : current.issueTypeId;
      const initialStatusId = typeof body.initialStatusId === "string" ? body.initialStatusId : current.initialStatusId;
      if (!current.project.issueTypes.some(({ id: candidate }) => candidate === issueTypeId) || !current.project.statuses.some(({ id: candidate }) => candidate === initialStatusId)) throw new Error("Issue type and workflow status must belong to this project.");
      if (typeof body.portalGroupId === "string" && !await tx.portalGroup.count({ where: { id: body.portalGroupId, projectId: current.projectId } })) throw new Error("Portal group must belong to this project.");
      const updated = await tx.serviceRequestType.update({ where: { id }, data: {
        ...(typeof body.name === "string" ? { name: body.name.trim() } : {}), ...(typeof body.description === "string" ? { description: body.description.trim() } : {}),
        ...(typeof body.icon === "string" ? { icon: body.icon.slice(0, 50) } : {}), ...(typeof body.position === "number" ? { position: body.position } : {}),
        ...(body.portalGroupId === null || typeof body.portalGroupId === "string" ? { portalGroupId: body.portalGroupId } : {}), issueTypeId, initialStatusId,
        draftSchema: schema as never, ...(body.consentText === null || typeof body.consentText === "string" ? { draftConsentText: typeof body.consentText === "string" ? body.consentText.trim() : null } : {}),
        ...(body.archived === true ? { archivedAt: new Date() } : body.archived === false ? { archivedAt: null } : {}),
      } });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: body.archived === true ? "service.request_type.archived" : "service.request_type.updated", targetType: "serviceRequestType", targetId: id, metadata: { projectId: current.projectId } } });
      return updated;
    });
    return NextResponse.json({ requestType: result });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Request type could not be updated." }, { status: 400 }); }
}
