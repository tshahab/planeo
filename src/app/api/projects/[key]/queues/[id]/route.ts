import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";
import { parseQueueDefinition, queueFilter, queueProject, QueueError, visibleQueues } from "@/lib/service-queues";
import { queueFailure as failure } from "@/lib/queue-http";

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const { key, id } = await params, project = await queueProject(context, key);
    const existing = await db.serviceQueue.findFirst({ where: { id, projectId: project.id, ...visibleQueues(context.user.id) } });
    if (!existing || existing.visibility === "PRIVATE" && existing.ownerId !== context.user.id || existing.visibility === "TEAM" && !await requireProjectPermission(context, project.id, "project.admin")) throw new QueueError("Queue not found.", 404);
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some(field => !["version", "name", "definition", "position", "isDefault"].includes(field))) throw new QueueError("Unsupported queue setting. Visibility is immutable.");
    if (!Number.isInteger(body.version) || body.version !== existing.version) throw new QueueError("Queue changed. Refresh and retry.", 409);
    const name = body.name === undefined ? existing.name : typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100 || body.position !== undefined && (!Number.isInteger(body.position) || Number(body.position) < 0 || Number(body.position) > 10000) || body.isDefault !== undefined && typeof body.isDefault !== "boolean") throw new QueueError("Invalid queue settings.");
    const definition = parseQueueDefinition(body.definition ?? existing.definition);
    await queueFilter(context, project.id, definition);
    await db.$transaction(async tx => {
      if (body.isDefault === true) await tx.serviceQueue.updateMany({ where: { projectId: project.id, id: { not: id }, visibility: existing.visibility, ...(existing.visibility === "PRIVATE" ? { ownerId: context.user.id } : {}) }, data: { isDefault: false, version: { increment: 1 } } });
      const result = await tx.serviceQueue.updateMany({ where: { id, version: existing.version }, data: { name, definition: definition as unknown as Prisma.InputJsonValue, ...(body.position !== undefined ? { position: Number(body.position) } : {}), ...(body.isDefault !== undefined ? { isDefault: body.isDefault === true } : {}), version: { increment: 1 } } });
      if (result.count !== 1) throw new QueueError("Queue changed. Refresh and retry.", 409);
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "service.queue.updated", targetType: "serviceQueue", targetId: id, metadata: { projectId: project.id } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
