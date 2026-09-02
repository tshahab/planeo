import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";
import { parseQueueDefinition, queueFilter, queueProject, QueueError, visibleQueues } from "@/lib/service-queues";
import { queueFailure as failure } from "@/lib/queue-http";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const project = await queueProject(context, (await params).key);
    const queues = await db.serviceQueue.findMany({ where: { projectId: project.id, ...visibleQueues(context.user.id) }, orderBy: [{ isDefault: "desc" }, { position: "asc" }, { id: "asc" }] });
    return NextResponse.json({ queues }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const project = await queueProject(context, (await params).key);
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100 || !["PRIVATE", "TEAM"].includes(String(body.visibility ?? "PRIVATE")) || body.position !== undefined && (!Number.isInteger(body.position) || Number(body.position) < 0 || Number(body.position) > 10000) || body.isDefault !== undefined && typeof body.isDefault !== "boolean") throw new QueueError("Invalid queue name or settings.");
    const visibility = String(body.visibility ?? "PRIVATE");
    if (visibility === "TEAM" && !await requireProjectPermission(context, project.id, "project.admin")) throw new QueueError("Team queue administration is not permitted.", 403);
    const definition = parseQueueDefinition(body.definition ?? {});
    await queueFilter(context, project.id, definition);
    const queue = await db.$transaction(async tx => {
      if (await tx.serviceQueue.count({ where: { projectId: project.id } }) >= 100) throw new QueueError("This project has reached its 100-queue limit.");
      if (body.isDefault === true) await tx.serviceQueue.updateMany({ where: { projectId: project.id, visibility, ...(visibility === "PRIVATE" ? { ownerId: context.user.id } : {}) }, data: { isDefault: false, version: { increment: 1 } } });
      const result = await tx.serviceQueue.create({ data: { projectId: project.id, ownerId: context.user.id, name, visibility, definition: definition as unknown as Prisma.InputJsonValue, position: Number(body.position ?? 0), isDefault: body.isDefault === true } });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "service.queue.created", targetType: "serviceQueue", targetId: result.id, metadata: { projectId: project.id } } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ queue }, { status: 201 });
  } catch (error) { return failure(error); }
}
