import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizationAdmin } from "@/lib/enterprise-organization";
import { createScimSecret, SCIM_SCOPES } from "@/lib/scim";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = await organizationAdmin(context.workspace.id, context.user.id);
  if (!admin) return NextResponse.json({ error: "Organization administration is required." }, { status: 403 });
  const tokens = await db.scimToken.findMany({ where: { organizationId: admin.organizationId }, select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true, lastUsedAt: true, revokedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ tokens }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = await organizationAdmin(context.workspace.id, context.user.id);
  if (!admin) return NextResponse.json({ error: "Organization administration is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { name?: unknown; scopes?: unknown; expiresAt?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const scopes = Array.isArray(body?.scopes) ? [...new Set(body.scopes.filter((scope): scope is typeof SCIM_SCOPES[number] => typeof scope === "string" && SCIM_SCOPES.includes(scope as typeof SCIM_SCOPES[number])))] : [];
  const expiresAt = typeof body?.expiresAt === "string" ? new Date(body.expiresAt) : null;
  if (name.length < 2 || name.length > 100 || !scopes.length || expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) return NextResponse.json({ error: "A valid name, scope set, and future expiry are required." }, { status: 400 });
  const secret = createScimSecret();
  const token = await db.$transaction(async tx => {
    const created = await tx.scimToken.create({ data: { organizationId: admin.organizationId, createdById: context.user.id, name, scopes, expiresAt, prefix: secret.prefix, secretHash: secret.secretHash } });
    await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "identity.scim_token.created", targetType: "scim_token", targetId: created.id, metadata: { name, scopes, expiresAt: expiresAt?.toISOString() ?? null, prefix: secret.prefix } } });
    return created;
  });
  return NextResponse.json({ token: { id: token.id, name, scopes, expiresAt, secret: secret.secret } }, { status: 201, headers: { "cache-control": "no-store" } });
}
