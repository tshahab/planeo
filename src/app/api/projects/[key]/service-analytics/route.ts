// @ts-nocheck
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { queueProject } from "@/lib/service-queues";
import { requireProjectPermission } from "@/lib/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const c = await getAuthContext();
  if (!c) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const p = await queueProject(c, (await params).key).catch(() => null);
  if (!p || !await requireProjectPermission(c, p.id, "issue.view")) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const createdAt = from || to ? { ...(from && !Number.isNaN(Date.parse(from)) ? { gte: new Date(from) } : {}), ...(to && !Number.isNaN(Date.parse(to)) ? { lt: new Date(to) } : {}) } : undefined;
  const rows = await db.serviceRequest.findMany({ where: { workspaceId: c.workspace.id, projectId: p.id, ...(createdAt ? { createdAt } : {}) }, select: { issue: { select: { status: { select: { category: true } } } }, requestType: { select: { name: true } } }, take: 10000 });
  const byType = new Map<string, { created: number; resolved: number; backlog: number }>();
  for (const row of rows) { const x = byType.get(row.requestType.name) ?? { created: 0, resolved: 0, backlog: 0 }; x.created++; row.issue.status.category === "DONE" ? x.resolved++ : x.backlog++; byType.set(row.requestType.name, x); }
  const metrics = [...byType].map(([requestType, values]) => ({ requestType, ...values }));
  if (url.searchParams.get("format") === "csv") return new NextResponse(["request_type,created,resolved,backlog", ...metrics.map(m => [m.requestType, m.created, m.resolved, m.backlog].map(v => JSON.stringify(v)).join(","))].join("\n"), { headers: { "content-type": "text/csv; charset=utf-8" } });
  return NextResponse.json({ generatedAt: new Date().toISOString(), timezone: "UTC", privacy: { minimumGroupSize: 5 }, filters: { from, to }, metrics: metrics.map(m => m.created < 5 ? { requestType: "Suppressed (<5)", created: m.created, resolved: m.resolved, backlog: m.backlog } : m) });
}
