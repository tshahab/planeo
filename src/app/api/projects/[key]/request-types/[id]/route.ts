import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";
import { validateRequestFormSchema } from "@/lib/request-forms";

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key, id } = await params;
  const item = await db.requestType.findFirst({ where: { id, project: { workspaceId: context.workspace.id, key: key.toUpperCase(), template: "SERVICE", archivedAt: null } }, include: { project: true } });
  if (!item || !await requireProjectPermission(context, item.projectId, "project.admin")) return NextResponse.json({ error: "Request type not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action;
  try {
    const result = await db.$transaction(async tx => {
      if (action === "preview") return { requestType: item, schema: await validateRequestFormSchema(tx, item.projectId, body?.schema ?? item.draftSchema), preview: true };
      if (action === "archive") return { requestType: await tx.requestType.update({ where: { id }, data: { status: "ARCHIVED" } }) };
      if (action === "publish") {
        const schema = await validateRequestFormSchema(tx, item.projectId, body?.schema ?? item.draftSchema);
        const latest = await tx.requestTypeVersion.aggregate({ where: { requestTypeId: id }, _max: { version: true } });
        const version = (latest._max.version ?? 0) + 1;
        const saved = await tx.requestTypeVersion.create({ data: { requestTypeId: id, version, schema: schema as unknown as Prisma.InputJsonValue, createdById: context.user.id } });
        const updated = await tx.requestType.update({ where: { id }, data: { draftSchema: schema as unknown as Prisma.InputJsonValue, status: "PUBLISHED", publishedVersion: version } });
        await tx.auditEvent.create({ data: { workspaceId: item.project.workspaceId, actorId: context.user.id, action: "request_type.published", targetType: "request_type", targetId: id, metadata: { projectId: item.projectId, version } } });
        return { requestType: updated, version: saved };
      }
      if (action !== "update") throw new Error("Unsupported request type action.");
      const schema = await validateRequestFormSchema(tx, item.projectId, body?.schema ?? item.draftSchema);
      const [issueType, status, group] = await Promise.all([
        body?.issueTypeId ? tx.issueType.findFirst({ where: { id: String(body.issueTypeId), projectId: item.projectId } }) : Promise.resolve(undefined),
        body?.initialStatusId ? tx.status.findFirst({ where: { id: String(body.initialStatusId), projectId: item.projectId } }) : Promise.resolve(undefined),
        body?.portalGroupId ? tx.portalGroup.findFirst({ where: { id: String(body.portalGroupId), projectId: item.projectId } }) : Promise.resolve(undefined),
      ]);
      if (body?.issueTypeId && !issueType || body?.initialStatusId && !status || body?.portalGroupId && !group) throw new Error("Mapped project configuration is invalid.");
      return { requestType: await tx.requestType.update({ where: { id }, data: { draftSchema: schema as unknown as Prisma.InputJsonValue, ...(typeof body?.name === "string" ? { name: body.name.trim().slice(0, 100) } : {}), ...(typeof body?.description === "string" ? { description: body.description.trim().slice(0, 1000) } : {}), ...(typeof body?.icon === "string" ? { icon: body.icon.trim().slice(0, 80) } : {}), ...(issueType ? { issueTypeId: issueType.id } : {}), ...(status ? { initialStatusId: status.id } : {}), ...(group ? { portalGroupId: group.id } : {}) } }) };
    });
    return NextResponse.json(result);
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Request type could not be updated." }, { status: 400 }); }
}
