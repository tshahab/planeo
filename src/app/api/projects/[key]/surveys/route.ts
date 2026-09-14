import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { queueProject } from "@/lib/service-queues";
import { requireProjectPermission } from "@/lib/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const project = await queueProject(context, (await params).key).catch(() => null);
  if (!project || !await requireProjectPermission(context, project.id, "issue.edit")) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as { requestId?: unknown; expiresInHours?: unknown } | null;
  if (typeof body?.requestId !== "string" || !body.requestId.trim()) return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  const requestRow = await db.serviceRequest.findFirst({ where: { id: body.requestId, workspaceId: context.workspace.id, projectId: project.id }, select: { id: true } });
  if (!requestRow) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const token = randomBytes(32).toString("base64url");
  const hours = typeof body.expiresInHours === "number" && Number.isFinite(body.expiresInHours) ? Math.max(1, Math.min(720, Math.floor(body.expiresInHours))) : 168;
  await db.satisfactionSurvey.create({ data: { workspaceId: context.workspace.id, requestId: requestRow.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + hours * 3600000) } });
  return NextResponse.json({ token, expiresInHours: hours }, { status: 201 });
}
