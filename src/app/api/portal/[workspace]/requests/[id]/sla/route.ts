import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalContext, portalRequestWhere } from "@/lib/portal-auth";
import { slaSummary } from "@/lib/sla";
export async function GET(_: Request, { params }: { params: Promise<{ workspace: string; id: string }> }) {
  const context = await getPortalContext(), { workspace, id } = await params;
  if (!context || context.workspace.slug !== workspace || !await db.serviceRequest.count({ where: { ...portalRequestWhere(context), id } })) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  return NextResponse.json({ targets: await slaSummary(id, true) }, { headers: { "Cache-Control": "no-store" } });
}
