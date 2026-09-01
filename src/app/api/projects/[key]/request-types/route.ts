import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";
import { validateRequestFormSchema } from "@/lib/request-forms";

async function serviceProject(workspaceId: string, key: string) { return db.project.findFirst({ where: { workspaceId, key: key.toUpperCase(), template: "SERVICE", archivedAt: null } }); }

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const project = await serviceProject(context.workspace.id, (await params).key);
  if (!project || !await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const [groups, requestTypes] = await Promise.all([
    db.portalGroup.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } }),
    db.requestType.findMany({ where: { projectId: project.id }, include: { issueType: true, initialStatus: true, portalGroup: true, versions: { orderBy: { version: "desc" }, select: { id: true, version: true, publishedAt: true, createdById: true } } }, orderBy: { position: "asc" } }),
  ]);
  return NextResponse.json({ groups, requestTypes });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const project = await serviceProject(context.workspace.id, (await params).key);
  if (!project || !await requireProjectPermission(context, project.id, "project.admin")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 100) return NextResponse.json({ error: "Request type name must contain 2–100 characters." }, { status: 400 });
  try {
    const created = await db.$transaction(async tx => {
      const [issueType, status, group, schema] = await Promise.all([
        tx.issueType.findFirst({ where: { id: String(body?.issueTypeId ?? ""), projectId: project.id } }),
        tx.status.findFirst({ where: { id: String(body?.initialStatusId ?? ""), projectId: project.id } }),
        body?.portalGroupId ? tx.portalGroup.findFirst({ where: { id: String(body.portalGroupId), projectId: project.id } }) : Promise.resolve(null),
        validateRequestFormSchema(tx, project.id, body?.schema),
      ]);
      if (!issueType || !status || body?.portalGroupId && !group) throw new Error("Issue type, workflow status, or portal group is invalid.");
      const count = await tx.requestType.count({ where: { projectId: project.id } });
      const item = await tx.requestType.create({ data: { projectId: project.id, portalGroupId: group?.id, issueTypeId: issueType.id, initialStatusId: status.id, name, description: typeof body?.description === "string" ? body.description.trim().slice(0, 1000) : null, icon: typeof body?.icon === "string" ? body.icon.trim().slice(0, 80) : null, position: count, draftSchema: schema as unknown as Prisma.InputJsonValue } });
      await tx.auditEvent.create({ data: { workspaceId: project.workspaceId, actorId: context.user.id, action: "request_type.created", targetType: "request_type", targetId: item.id, metadata: { projectId: project.id } } });
      return item;
    });
    return NextResponse.json({ requestType: created }, { status: 201 });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Request type could not be created." }, { status: 400 }); }
}
