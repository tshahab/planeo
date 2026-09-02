import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { applyQueueAction } from "@/lib/service-queues";
import { queueFailure as failure } from "@/lib/queue-http";

export async function POST(request: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try { const { key, id } = await params, body = await request.json(); return NextResponse.json(await applyQueueAction(context, key, id, body.snapshotId, body.ids, body.action)); }
  catch (error) { return failure(error); }
}
