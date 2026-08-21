import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleProjectWhere } from "@/lib/project-query";

const PAGE_SIZE = 25;

export async function GET(request: Request) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const pageValue = Number(new URL(request.url).searchParams.get("page") ?? 1);
  const page = Number.isInteger(pageValue) && pageValue > 0 && pageValue <= 10_000 ? pageValue : 1;
  const where = { workspaceId: context.workspace.id, userId: context.user.id, issue: { is: { archivedAt: null, project: { is: accessibleProjectWhere(context) } } } };
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, type: true, title: true, resourceUrl: true, readAt: true, createdAt: true, actor: { select: { id: true, name: true } }, issue: { select: { project: { select: { name: true } } } } } }),
    db.notification.count({ where }), db.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return NextResponse.json({ items, total, unread, page, pageSize: PAGE_SIZE });
}

export async function PATCH() {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  await db.notification.updateMany({ where: { workspaceId: context.workspace.id, userId: context.user.id, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ unread: 0 });
}
