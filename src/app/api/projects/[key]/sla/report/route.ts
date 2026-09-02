import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { slaReport } from "@/lib/sla-report";
import { queueFailure } from "@/lib/queue-http";
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try { return NextResponse.json(await slaReport(context, (await params).key, Number(new URL(request.url).searchParams.get("days") ?? 90)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return queueFailure(error); }
}
