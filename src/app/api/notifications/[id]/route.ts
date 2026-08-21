import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleProjectWhere } from "@/lib/project-query";

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const notification = await db.notification.findFirst({ where: { id, workspaceId: context.workspace.id, userId: context.user.id, issue: { is: { archivedAt: null, project: { is: accessibleProjectWhere(context) } } } } });
  if (!notification) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  await db.notification.update({ where: { id }, data: { readAt: notification.readAt ?? new Date() } });
  return NextResponse.json({ read: true });
}
