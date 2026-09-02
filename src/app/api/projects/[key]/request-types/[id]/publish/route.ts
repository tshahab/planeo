import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertPortalSchemaReferences, parsePortalSchema } from "@/lib/service-requests";
import { requireProjectPermission } from "@/lib/permissions";

export async function POST(_: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key, id } = await params;
  const current = await db.serviceRequestType.findFirst({ where: { id, archivedAt: null, project: { workspaceId: context.workspace.id, key: key.toUpperCase(), template: "SERVICE" } } });
  if (!current) return NextResponse.json({ error: "Request type not found." }, { status: 404 });
  if (!await requireProjectPermission(context, current.projectId, "project.admin")) return NextResponse.json({ error: "Request type not found." }, { status: 404 });
  try {
    const version = await db.$transaction(async (tx) => {
      await assertPortalSchemaReferences(tx, context.workspace.id, current.projectId, current.draftSchema);
      const schema = parsePortalSchema(current.draftSchema);
      const next = current.currentVersion + 1;
      const created = await tx.serviceRequestTypeVersion.create({ data: { requestTypeId: current.id, version: next, name: current.name, description: current.description, icon: current.icon, schema: schema as never, consentText: current.draftConsentText, publishedById: context.user.id } });
      const advanced = await tx.serviceRequestType.updateMany({ where: { id: current.id, currentVersion: current.currentVersion }, data: { currentVersion: next, publishedAt: new Date() } });
      if (advanced.count !== 1) throw new Error("The request type changed while it was being published. Retry with the latest draft.");
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "service.request_type.published", targetType: "serviceRequestType", targetId: id, metadata: { projectId: current.projectId, version: next } } });
      return created;
    });
    return NextResponse.json({ version }, { status: 201 });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Request type could not be published." }, { status: 409 }); }
}
