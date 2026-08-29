import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateFieldDefinition } from "@/lib/custom-fields";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const fields = await db.customField.findMany({ where: { workspaceId: context.workspace.id }, include: { projects: { include: { project: { select: { id: true, key: true, name: true } } }, orderBy: { position: "asc" } } }, orderBy: [{ archivedAt: "asc" }, { name: "asc" }] });
  return NextResponse.json({ fields });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role !== "OWNER" && context.role !== "ADMIN") return NextResponse.json({ error: "Workspace administration is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    if (!body) throw new Error("A field definition is required.");
    const definition = validateFieldDefinition(body);
    const defaultValue = body.defaultValue === undefined ? undefined : body.defaultValue;
    validateDefault(definition.type, definition.options, defaultValue);
    const field = await db.customField.create({ data: { workspaceId: context.workspace.id, ...definition, options: definition.options as Prisma.InputJsonValue, ...(defaultValue === undefined ? {} : { defaultValue: defaultValue as Prisma.InputJsonValue }) } });
    await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "custom_field.created", targetType: "custom_field", targetId: field.id, metadata: { stableId: field.id, type: field.type } } });
    return NextResponse.json({ field }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Custom field could not be created.";
    return NextResponse.json({ error: message }, { status: message.includes("Unique constraint") ? 409 : 400 });
  }
}

function validateDefault(type: string, options: string[], value: unknown) {
  if (value === undefined || value === null || value === "") return;
  const valid = type === "TEXT" ? typeof value === "string" : type === "NUMBER" ? typeof value === "number" && Number.isFinite(value) : type === "BOOLEAN" ? typeof value === "boolean" : type === "DATE" ? typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) : type === "URL" ? validUrl(value) : type === "SINGLE_SELECT" ? typeof value === "string" && options.includes(value) : type === "MULTI_SELECT" ? Array.isArray(value) && value.every((item) => typeof item === "string" && options.includes(item)) : type === "USER" ? typeof value === "string" : false;
  if (!valid) throw new Error("Default value does not match the field type or options.");
}
function validUrl(value: unknown) { if (typeof value !== "string") return false; try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }
