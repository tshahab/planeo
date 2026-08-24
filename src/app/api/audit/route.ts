import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { redactAuditMetadata } from "@/lib/audit";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role !== "OWNER" && context.role !== "ADMIN") return NextResponse.json({ error: "Workspace administration is required." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(params.get("pageSize") ?? "25", 10) || 25));
  const actorId = params.get("actorId")?.trim(); const action = params.get("action")?.trim(); const targetType = params.get("targetType")?.trim();
  const from = date(params.get("from"), false); const to = date(params.get("to"), true);
  if ((params.has("from") && !from) || (params.has("to") && !to)) return NextResponse.json({ error: "Date filter is invalid." }, { status: 400 });
  const where = { workspaceId: context.workspace.id, ...(actorId ? { actorId } : {}), ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}), ...(targetType ? { targetType } : {}), ...((from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) };
  const [events, total, actors, actions, targetTypes] = await Promise.all([
    db.auditEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.auditEvent.count({ where }),
    db.workspaceMember.findMany({ where: { workspaceId: context.workspace.id }, select: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } } }),
    db.auditEvent.findMany({ where: { workspaceId: context.workspace.id }, distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    db.auditEvent.findMany({ where: { workspaceId: context.workspace.id }, distinct: ["targetType"], select: { targetType: true }, orderBy: { targetType: "asc" } }),
  ]);
  const actorIds = [...new Set(events.map(event => event.actorId).filter(Boolean) as string[])];
  const eventActors = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }); const actorMap = new Map(eventActors.map(actor => [actor.id, actor]));
  return NextResponse.json({ events: events.map(event => ({ ...event, metadata: redactAuditMetadata(event.metadata), actor: event.actorId ? actorMap.get(event.actorId) ?? null : null })), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), filters: { actors: actors.map(item => item.user), actions: actions.map(item => item.action), targetTypes: targetTypes.map(item => item.targetType) } });
}
function date(value: string | null, end: boolean) { if (!value) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const result = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`); return Number.isNaN(result.getTime()) ? null : result; }
