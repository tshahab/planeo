import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logEvent, requestId } from "@/lib/observability";
import { attachmentStorage } from "@/lib/storage";

export async function GET(request: Request) {
  const correlationId = requestId(request.headers);
  try {
    await Promise.all([db.$queryRaw`SELECT 1`, attachmentStorage.ready()]);
    return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store", "X-Request-Id": correlationId } });
  } catch (cause) {
    logEvent("error", "readiness.failed", { requestId: correlationId, error: cause instanceof Error ? cause.message : "unknown" });
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": correlationId } });
  }
}
