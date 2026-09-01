import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = context.role === "OWNER" || context.role === "ADMIN";
  const project = await db.project.findFirst({ where: { workspaceId: context.workspace.id, key: (await params).key.toUpperCase(), template: "SERVICE", archivedAt: null, ...(admin ? {} : { OR: [{ visibility: "PUBLIC" }, { members: { some: { userId: context.user.id } } }] }) }, select: { id: true, key: true, name: true, description: true } });
  if (!project) return NextResponse.json({ error: "Portal not found." }, { status: 404 });
  const groups = await db.portalGroup.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" }, include: { requestTypes: { where: { status: "PUBLISHED" }, orderBy: { position: "asc" }, select: { id: true, name: true, description: true, icon: true, publishedVersion: true } } } });
  return NextResponse.json({ project, groups });
}
