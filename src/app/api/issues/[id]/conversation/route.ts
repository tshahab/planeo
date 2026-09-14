import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewIssue } from "@/lib/permissions";
import { queueProject, QueueError } from "@/lib/service-queues";
import { queueFailure } from "@/lib/queue-http";
import { queueCustomerEmail } from "@/lib/service-email";
import { publishRealtime } from "@/lib/realtime";
async function scoped(id: string, edit = false) {
  const context = await getAuthContext(); if (!context) throw new QueueError("Authentication required.", 401);
  const item = await db.serviceRequest.findFirst({ where: { issueId: id, workspaceId: context.workspace.id }, include: { project: { select: { key: true } } } });
  if (!item || !await canViewIssue(context, id)) throw new QueueError("Request not found.", 404);
  await queueProject(context, item.project.key, edit); return { context, item };
}
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { item } = await scoped((await params).id); const comments = await db.portalComment.findMany({ where: { requestId: item.id }, select: { id: true, body: true, createdAt: true, customer: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 200 }); return NextResponse.json({ comments: comments.map(comment => ({ id: comment.id, body: comment.body, createdAt: comment.createdAt, author: comment.customer?.name ?? "Support team" })) }); } catch (error) { return queueFailure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { context, item } = await scoped((await params).id, true), body = await request.json(), text = typeof body.body === "string" ? body.body.trim() : "";
    if (body.mode !== "PUBLIC" || !text || text.length > 5000 || !/^[a-zA-Z0-9-]{10,100}$/.test(String(body.idempotencyKey))) throw new QueueError("Choose public reply and provide a valid message.");
    const messageId = `agent:${item.id}:${body.idempotencyKey}`;
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "ServiceRequest" WHERE id = ${item.id} FOR UPDATE`;
      const existing = await tx.portalComment.findUnique({ where: { messageId } }); if (existing) return;
      const comment = await tx.portalComment.create({ data: { requestId: item.id, agentId: context.user.id, body: text, messageId } });
      await queueCustomerEmail(tx, item.id, text, comment.id);
      await publishRealtime(tx, { workspaceId: context.workspace.id, projectId: item.projectId, type: "issue.updated", resourceId: item.issueId, payload: { id: item.issueId } });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "service.reply.public", targetType: "serviceRequest", targetId: item.id, metadata: { commentId: comment.id, correlationId: randomUUID() } } });
    }); return NextResponse.json({ ok: true });
  } catch (error) { return queueFailure(error); }
}
