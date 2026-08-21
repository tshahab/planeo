import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeSavedQuery, validateSavedQuery } from "@/lib/saved-filter";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params; const existing = await db.savedFilter.findFirst({ where: { id, workspaceId: context.workspace.id, ownerId: context.user.id } });
  if (!existing) return NextResponse.json({ error: "Saved filter not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as { name?: unknown; query?: unknown; shared?: unknown } | null; const data: { name?: string; query?: object; shared?: boolean } = {};
  if (body?.name !== undefined) { const name = typeof body.name === "string" ? body.name.trim() : ""; if (!name || name.length > 80) return NextResponse.json({ error: "Name must contain 1–80 characters." }, { status: 400 }); data.name = name; }
  if (body?.query !== undefined) { const query = normalizeSavedQuery(body.query); if (!query || !await validateSavedQuery(context, query)) return NextResponse.json({ error: "The filter definition is invalid or inaccessible." }, { status: 400 }); data.query = query; }
  if (body?.shared !== undefined) { if (typeof body.shared !== "boolean") return NextResponse.json({ error: "Sharing value is invalid." }, { status: 400 }); data.shared = body.shared; }
  if (!Object.keys(data).length) return NextResponse.json({ error: "No supported changes were provided." }, { status: 400 });
  try { const filter = await db.savedFilter.update({ where: { id }, data, select: { id: true, name: true, query: true, shared: true, ownerId: true, owner: { select: { name: true } }, updatedAt: true } }); return NextResponse.json({ filter }); }
  catch { return NextResponse.json({ error: "A filter with that name already exists." }, { status: 409 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params; const removed = await db.savedFilter.deleteMany({ where: { id, workspaceId: context.workspace.id, ownerId: context.user.id } });
  if (!removed.count) return NextResponse.json({ error: "Saved filter not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
