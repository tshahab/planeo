import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeSavedQuery, validateSavedQuery } from "@/lib/saved-filter";

export async function GET() {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const filters = await db.savedFilter.findMany({ where: { workspaceId: context.workspace.id, OR: [{ ownerId: context.user.id }, { shared: true }] }, orderBy: [{ ownerId: "asc" }, { name: "asc" }], select: { id: true, name: true, query: true, shared: true, ownerId: true, owner: { select: { name: true } }, updatedAt: true } });
  return NextResponse.json({ filters });
}

export async function POST(request: Request) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { name?: unknown; query?: unknown; shared?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : ""; const query = normalizeSavedQuery(body?.query);
  if (!name || name.length > 80 || !query || typeof body?.shared !== "boolean") return NextResponse.json({ error: "Use a name of 1–80 characters and a valid filter definition." }, { status: 400 });
  if (!await validateSavedQuery(context, query)) return NextResponse.json({ error: "The filter references inaccessible or invalid values." }, { status: 400 });
  try { const filter = await db.savedFilter.create({ data: { workspaceId: context.workspace.id, ownerId: context.user.id, name, query, shared: body.shared }, select: { id: true, name: true, query: true, shared: true, ownerId: true, owner: { select: { name: true } }, updatedAt: true } }); return NextResponse.json({ filter }, { status: 201 }); }
  catch { return NextResponse.json({ error: "You already have a saved filter with this name." }, { status: 409 }); }
}
