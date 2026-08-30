import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizationAdmin } from "@/lib/enterprise-organization";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = await organizationAdmin(context.workspace.id, context.user.id);
  if (!admin) return NextResponse.json({ organization: null });
  const organization = await db.organization.findUnique({ where: { id: admin.organizationId }, include: { domains: { select: { id: true, domain: true, status: true, challengeExpiresAt: true, verifiedAt: true, revokedAt: true } }, workspaces: { select: { id: true, name: true, slug: true } } } });
  return NextResponse.json({ organization }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role !== "OWNER") return NextResponse.json({ error: "Workspace ownership is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { name?: unknown; slug?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (name.length < 2 || name.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: "A valid organization name and slug are required." }, { status: 400 });
  try {
    const organization = await db.$transaction(async tx => {
      const workspace = await tx.workspace.findUnique({ where: { id: context.workspace.id }, select: { organizationId: true } });
      if (!workspace || workspace.organizationId) throw new Error("already-adopted");
      const created = await tx.organization.create({ data: { name, slug, allowedDomains: [], members: { create: { userId: context.user.id, role: "OWNER", breakGlass: true, recoveryConfirmedAt: new Date() } } } });
      const adopted = await tx.workspace.updateMany({ where: { id: context.workspace.id, organizationId: null }, data: { organizationId: created.id } });
      if (adopted.count !== 1) throw new Error("adoption-conflict");
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "organization.created", targetType: "organization", targetId: created.id, metadata: { slug } } });
      return created;
    });
    return NextResponse.json({ organization }, { status: 201 });
  } catch { return NextResponse.json({ error: "This workspace cannot be adopted by that organization." }, { status: 409 }); }
}

export async function PATCH(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = await organizationAdmin(context.workspace.id, context.user.id);
  if (!admin) return NextResponse.json({ error: "Organization administration is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "A policy update is required." }, { status: 400 });
  const current = await db.organization.findUnique({ where: { id: admin.organizationId }, include: { members: { where: { deactivatedAt: null, breakGlass: true, recoveryConfirmedAt: { not: null } } } } });
  if (!current) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  const data = {
    allowAccountLinking: typeof body.allowAccountLinking === "boolean" ? body.allowAccountLinking : current.allowAccountLinking,
    restrictInvitations: typeof body.restrictInvitations === "boolean" ? body.restrictInvitations : current.restrictInvitations,
    enforceSso: typeof body.enforceSso === "boolean" ? body.enforceSso : current.enforceSso,
    allowLocalLogin: typeof body.allowLocalLogin === "boolean" ? body.allowLocalLogin : current.allowLocalLogin,
    allowJitProvisioning: typeof body.allowJitProvisioning === "boolean" ? body.allowJitProvisioning : current.allowJitProvisioning,
    sessionLifetimeMinutes: typeof body.sessionLifetimeMinutes === "number" ? Math.trunc(body.sessionLifetimeMinutes) : current.sessionLifetimeMinutes,
    privilegedReauthMinutes: typeof body.privilegedReauthMinutes === "number" ? Math.trunc(body.privilegedReauthMinutes) : current.privilegedReauthMinutes,
  };
  if (data.sessionLifetimeMinutes < 5 || data.sessionLifetimeMinutes > 43200 || data.privilegedReauthMinutes < 1 || data.privilegedReauthMinutes > 1440) return NextResponse.json({ error: "Policy lifetimes are outside the supported range." }, { status: 400 });
  if (data.enforceSso && !data.allowLocalLogin && current.members.length === 0) return NextResponse.json({ error: "Confirm at least one recoverable break-glass administrator first." }, { status: 409 });
  const organization = await db.$transaction(async tx => {
    const updated = await tx.organization.update({ where: { id: current.id }, data });
    await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "organization.authentication_policy.updated", targetType: "organization", targetId: current.id, metadata: { before: { enforceSso: current.enforceSso, allowLocalLogin: current.allowLocalLogin, sessionLifetimeMinutes: current.sessionLifetimeMinutes }, after: data } } });
    return updated;
  });
  return NextResponse.json({ organization });
}
