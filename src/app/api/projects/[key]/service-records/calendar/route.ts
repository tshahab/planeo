// @ts-nocheck
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { queueProject } from "@/lib/service-queues";
import { requireProjectPermission } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const project = await queueProject(context, (await params).key).catch(() => null);
  if (!project || !await requireProjectPermission(context, project.id, "issue.view")) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const records = await db.serviceRecord.findMany({ where: { workspaceId: context.workspace.id, projectId: project.id, kind: "CHANGE" }, orderBy: { createdAt: "asc" }, take: 500 });
  const entries = records.map((record) => {
    const details = record.details && typeof record.details === "object" && !Array.isArray(record.details) ? record.details as Record<string, unknown> : {};
    const start = typeof details.startAt === "string" ? details.startAt : null;
    const end = typeof details.endAt === "string" ? details.endAt : null;
    return { id: record.id, title: record.title, status: record.status, startAt: start, endAt: end };
  }).filter((entry) => entry.startAt && entry.endAt);
  const conflicts = entries.flatMap((a, i) => entries.slice(i + 1).filter((b) => new Date(a.startAt!).getTime() < new Date(b.endAt!).getTime() && new Date(b.startAt!).getTime() < new Date(a.endAt!).getTime()).map((b) => [a.id, b.id]));
  return NextResponse.json({ entries, conflicts });
}
