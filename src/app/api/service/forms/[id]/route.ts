import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicForm } from "@/lib/service-requests";
import { requireProjectPermission } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const requestType = await db.serviceRequestType.findFirst({ where: { id, archivedAt: null, publishedAt: { not: null }, project: { workspaceId: context.workspace.id, template: "SERVICE", archivedAt: null } }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  const version = requestType?.versions[0];
  if (!requestType || !version || !await requireProjectPermission(context, requestType.projectId, "issue.create")) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  return NextResponse.json({ form: publicForm(version) });
}
