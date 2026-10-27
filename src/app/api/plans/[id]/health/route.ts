import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { PlanError, planItems } from "@/lib/portfolio-plan";
import { calculatePortfolioHealth } from "@/lib/portfolio-health";

const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const id = (await params).id;
    const first = await planItems(context, id, 1);
    const pages = [first];
    const totalPages = Math.min(50, Math.ceil(first.total / first.pageSize));
    for (let page = 2; page <= totalPages; page += 1) pages.push(await planItems(context, id, page));
    const items = pages.flatMap((page) => page.items).map((item) => ({ id: item.id, dueDate: item.dueDate, completedAt: item.completedAt?.toISOString() ?? null, estimate: item.estimate }));
    const result = { plan: { id: first.plan.id, name: first.plan.name }, health: { ...calculatePortfolioHealth(items), scope: { total: first.total, bounded: first.total > items.length } } };
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
