import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { queueProject, QueueError } from "@/lib/service-queues";
import { requireProjectPermission } from "@/lib/permissions";
import { encryptSecret } from "@/lib/webhooks";
import { queueFailure } from "@/lib/queue-http";
export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try { const project = await queueProject(context, (await params).key); if (!await requireProjectPermission(context, project.id, "project.admin")) throw new QueueError("Project not found.", 404);
    const mailbox = await db.serviceMailbox.findUnique({ where: { projectId: project.id }, select: { id: true, address: true, requestTypeId: true, enabled: true, messages: { orderBy: { receivedAt: "desc" }, take: 50, select: { id: true, status: true, reason: true, receivedAt: true } } } }); const failures = await db.emailDelivery.findMany({ where: { workspaceId: context.workspace.id, issue: { projectId: project.id }, category: "PORTAL_CONVERSATION", status: "DEAD" }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, lastError: true, updatedAt: true } }); return NextResponse.json({ mailbox, failures });
  } catch (error) { return queueFailure(error); }
}
export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try { const project = await queueProject(context, (await params).key); if (!await requireProjectPermission(context, project.id, "project.admin")) throw new QueueError("Project not found.", 404);
    const body = await request.json(), address = typeof body.address === "string" ? body.address.trim().toLowerCase() : "";
    if (!/^[a-z0-9._+-]{1,64}@[a-z0-9.-]{1,190}$/.test(address) || !await db.serviceRequestType.count({ where: { id: String(body.requestTypeId), projectId: project.id, archivedAt: null, publishedAt: { not: null } } })) throw new QueueError("Use a valid inbound address and published project request type.");
    const secret = randomBytes(32).toString("base64url");
    const mailbox = await db.serviceMailbox.upsert({ where: { projectId: project.id }, create: { projectId: project.id, address, requestTypeId: body.requestTypeId, enabled: body.enabled !== false, encryptedSecret: encryptSecret(secret) }, update: { address, requestTypeId: body.requestTypeId, enabled: body.enabled !== false, encryptedSecret: encryptSecret(secret) }, select: { id: true, address: true } });
    await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "service.mailbox.configured", targetType: "serviceMailbox", targetId: mailbox.id } });
    return NextResponse.json({ mailbox, secret }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return queueFailure(error); }
}
