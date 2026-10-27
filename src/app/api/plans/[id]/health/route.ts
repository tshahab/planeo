import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { PlanError, planItems, visiblePlan } from "@/lib/portfolio-plan";
import { calculatePortfolioHealth } from "@/lib/portfolio-health";

const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const id = (await params).id;
    const snapshotId = new URL(request.url).searchParams.get("snapshot");
    if (new URL(request.url).searchParams.get("history") === "true") {
      const plan = await visiblePlan(context, id);
      const snapshots = await db.portfolioHealthSnapshot.findMany({ where: { planId: plan.id, workspaceId: context.workspace.id }, select: { id: true, authorId: true, capturedAt: true, report: true }, orderBy: { capturedAt: "desc" }, take: 100 });
      return NextResponse.json({ plan: { id: plan.id, name: plan.name }, snapshots }, { headers: { "cache-control": "private, no-store" } });
    }
    if (snapshotId) {
      await visiblePlan(context, id);
      const snapshot = await db.portfolioHealthSnapshot.findFirst({ where: { id: snapshotId, planId: id, workspaceId: context.workspace.id }, select: { id: true, planId: true, authorId: true, capturedAt: true, report: true } });
      if (!snapshot) throw new PlanError("Health snapshot not found.", 404);
      return NextResponse.json({ plan: { id }, snapshot }, { headers: { "cache-control": "private, no-store" } });
    }
    const first = await planItems(context, id, 1);
    const pages = [first];
    const totalPages = Math.min(50, Math.ceil(first.total / first.pageSize));
    for (let page = 2; page <= totalPages; page += 1) pages.push(await planItems(context, id, page));
    const items = pages.flatMap((page) => page.items).map((item) => ({ id: item.id, dueDate: item.dueDate, completedAt: item.completedAt?.toISOString() ?? null, estimate: item.estimate }));
    const suppressed = first.plan.shared && first.total > 0 && first.total < 5;
    const calculated = { ...calculatePortfolioHealth(items), scope: { total: first.total, bounded: first.total > items.length } };
    const result = { plan: { id: first.plan.id, name: first.plan.name }, health: suppressed ? { ...calculated, privacy: { suppressed: true, reason: "Shared plan aggregates require at least five visible issues." }, progress: { completed: 0, completionRate: 0, remaining: 0 }, schedule: { overdue: 0, unscheduled: 0, confidence: "LOW" as const }, forecast: { remainingPoints: 0, lowDays: 0, highDays: 0, confidence: "LOW" as const } } : { ...calculated, privacy: { suppressed: false } } };
    if (new URL(request.url).searchParams.get("format") === "csv") {
      const rows = ["metric,value", ["total", result.health.scope.total], ["completed", result.health.progress.completed], ["completionRate", result.health.progress.completionRate], ["overdue", result.health.schedule.overdue], ["unscheduled", result.health.schedule.unscheduled], ["remainingPoints", result.health.forecast.remainingPoints], ["lowDays", result.health.forecast.lowDays], ["highDays", result.health.forecast.highDays]].map((row) => Array.isArray(row) ? row.map(cell).join(",") : row);
      return new NextResponse(rows.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${first.plan.name.replace(/[^a-z0-9-]+/gi, "-")}-health.csv"` } });
    }
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (cause) {
    const error = cause as PlanError;
    return NextResponse.json({ error: error.message }, { status: error.status ?? 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const id = (await params).id;
  const response = await GET(new Request(new URL(request.url).toString()), { params: Promise.resolve({ id }) });
  if (!response.ok) return response;
  const result = await response.json();
  const snapshot = await (await import("@/lib/db")).db.portfolioHealthSnapshot.create({ data: { workspaceId: context.workspace.id, planId: id, authorId: context.user.id, report: result.health } });
  return NextResponse.json({ snapshot }, { status: 201 });
}
