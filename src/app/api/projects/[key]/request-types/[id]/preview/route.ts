import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePortalSchema } from "@/lib/service-requests";
import { requireProjectPermission } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key, id } = await params;
  const type = await db.serviceRequestType.findFirst({ where: { id, project: { workspaceId: context.workspace.id, key: key.toUpperCase(), template: "SERVICE" } } });
  if (!type) return NextResponse.json({ error: "Request type not found." }, { status: 404 });
  if (!await requireProjectPermission(context, type.projectId, "project.admin")) return NextResponse.json({ error: "Request type not found." }, { status: 404 });
  try { return NextResponse.json({ form: { name: type.name, description: type.description, icon: type.icon, schema: parsePortalSchema(type.draftSchema, { allowIncomplete: true }), consentText: type.draftConsentText, draft: true } }); }
  catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Draft cannot be previewed." }, { status: 400 }); }
}
