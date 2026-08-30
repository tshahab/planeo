import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDomainChallenge, domainRecordName, normalizeDomain, organizationAdmin } from "@/lib/enterprise-organization";

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = await organizationAdmin(context.workspace.id, context.user.id);
  if (!admin) return NextResponse.json({ error: "Organization administration is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { domain?: unknown } | null;
  const domain = typeof body?.domain === "string" ? normalizeDomain(body.domain) : null;
  if (!domain) return NextResponse.json({ error: "A valid registrable domain is required." }, { status: 400 });
  const challenge = createDomainChallenge();
  try {
    const claim = await db.$transaction(async tx => {
      const created = await tx.organizationDomain.create({ data: { organizationId: admin.organizationId, domain, challengeHash: challenge.hash, challengeExpiresAt: challenge.expiresAt } });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "organization.domain.claimed", targetType: "organization_domain", targetId: created.id, metadata: { domain } } });
      return created;
    });
    return NextResponse.json({ id: claim.id, domain, record: domainRecordName(domain), value: challenge.secret, expiresAt: challenge.expiresAt }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "That domain is already claimed." }, { status: 409 }); }
}
