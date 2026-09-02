import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalContext, portalRequestWhere } from "@/lib/portal-auth";

export async function GET(request: Request, { params }: { params: Promise<{ workspace: string }> }) {
  const context = await getPortalContext(); const { workspace } = await params;
  if (!context || context.workspace.slug !== workspace) return NextResponse.json({ error: "Portal not found." }, { status: 404 });
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100);
  const requests = await db.serviceRequest.findMany({ where: { ...portalRequestWhere(context), ...(query ? { issue: { summary: { contains: query, mode: "insensitive" } } } : {}) }, select: { id: true, createdAt: true, sharing: true, issue: { select: { number: true, summary: true, updatedAt: true, project: { select: { key: true, name: true } }, status: { select: { name: true, category: true } } } }, requestTypeVersion: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ requests: requests.map((item) => ({ id: item.id, key: `${item.issue.project.key}-${item.issue.number}`, summary: item.issue.summary, project: item.issue.project.name, requestType: item.requestTypeVersion.name, status: item.issue.status, sharing: item.sharing, createdAt: item.createdAt, updatedAt: item.issue.updatedAt })) });
}
