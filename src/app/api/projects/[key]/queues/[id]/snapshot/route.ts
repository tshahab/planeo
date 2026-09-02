import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createQueueSnapshot, queueMetrics, readQueueSnapshot, QueueError } from "@/lib/service-queues";
import { queueFailure as failure } from "@/lib/queue-http";

export async function POST(_: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try { const { key, id } = await params; return NextResponse.json(await createQueueSnapshot(context, key, id), { status: 201 }); }
  catch (error) { return failure(error); }
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const { key, id } = await params, query = new URL(request.url).searchParams;
    const page = Number(query.get("page") ?? 1), size = Number(query.get("size") ?? 25);
    if (!Number.isInteger(page) || page < 1 || page > 2000 || !Number.isInteger(size) || size < 1 || size > 100) throw new QueueError("Invalid pagination.");
    const { rows, snapshot, definition } = await readQueueSnapshot(context, key, id, query.get("snapshot") ?? "");
    return NextResponse.json({ snapshotId: snapshot.id, createdAt: snapshot.createdAt, expiresAt: snapshot.expiresAt, definition, metrics: queueMetrics(rows, snapshot.createdAt.getTime()), rows: rows.slice((page - 1) * size, page * size), page, size }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
