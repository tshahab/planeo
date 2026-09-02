import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewIssue } from "@/lib/permissions";
import { queueProject, QueueError } from "@/lib/service-queues";
import { queueFailure } from "@/lib/queue-http";
import { slaSummary } from "@/lib/sla";
import { enqueueSlaSignal } from "@/lib/sla-signals";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const { id } = await params, request = await db.serviceRequest.findFirst({ where: { issueId: id, workspaceId: context.workspace.id }, include: { project: { select: { key: true } } } });
    if (!request || !await canViewIssue(context, id)) throw new QueueError("Request not found.", 404);
    await queueProject(context, request.project.key);
    return NextResponse.json({ targets: await slaSummary(request.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return queueFailure(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const { id } = await params, item = await db.serviceRequest.findFirst({ where: { issueId: id, workspaceId: context.workspace.id }, include: { project: { select: { key: true } } } });
    if (!item || !await canViewIssue(context, id)) throw new QueueError("Request not found.", 404);
    await queueProject(context, item.project.key, true);
    const body = await request.json();
    if (body.event !== "agent.replied") throw new QueueError("Only an agent response confirmation is supported.");
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) throw new QueueError("Explain how the customer was contacted (10–500 characters).");
    await db.$transaction(async tx => {
      const eventKey = `response:${randomUUID()}`;
      await enqueueSlaSignal(tx, { issueId: id, event: "agent.replied", eventKey });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "sla.response.confirmed", targetType: "serviceRequest", targetId: item.id, metadata: { eventKey, reason } } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return queueFailure(error); }
}
