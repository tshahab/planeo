import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { consumeRateLimit, requestClientKey } from "@/lib/security";
import { assertionIdentifier, consumeAssertion, mappedProfile, readRelayState, samlClient } from "@/lib/saml";

function redirect(path: string) { return NextResponse.redirect(new URL(path, process.env.PUBLIC_APP_URL ?? "http://localhost:3000")); }

export async function POST(request: Request, { params }: { params: Promise<{ organization: string }> }) {
  const rate = await consumeRateLimit(`saml-callback:${requestClientKey(request)}`, 60, 60);
  if (!rate.allowed) return NextResponse.json({ error: "Too many authentication attempts." }, { status: 429 });
  const { organization: organizationId } = await params;
  const organization = await db.organization.findUnique({ where: { id: organizationId }, include: { samlConfiguration: true, domains: { where: { status: "VERIFIED", revokedAt: null } }, workspaces: { orderBy: { createdAt: "asc" }, take: 1 } } });
  const configuration = organization?.samlConfiguration;
  if (!organization || !configuration || !organization.workspaces[0]) return NextResponse.json({ error: "Single sign-on is unavailable." }, { status: 404 });
  const form = await request.formData();
  const samlResponse = form.get("SAMLResponse");
  const relayValue = form.get("RelayState");
  if (typeof samlResponse !== "string" || samlResponse.length > 2_000_000) return NextResponse.json({ error: "Invalid SAML response." }, { status: 400 });
  const relay = typeof relayValue === "string" ? readRelayState(relayValue) : null;
  if (relay && relay.organizationId !== organization.id) return NextResponse.json({ error: "Invalid SAML response." }, { status: 400 });
  if (!configuration.enabled && !relay?.test) return NextResponse.json({ error: "Single sign-on is unavailable." }, { status: 404 });
  if (!relay && !configuration.allowIdpInitiated) return NextResponse.json({ error: "Unsolicited SAML responses are disabled." }, { status: 400 });
  try {
    const result = await samlClient(configuration).validatePostResponseAsync({ SAMLResponse: samlResponse });
    const profile = result.profile;
    if (!profile || result.loggedOut || profile.issuer !== configuration.idpIssuer || !await consumeAssertion(organization.id, assertionIdentifier(profile))) throw new Error("assertion_rejected");
    const mapping = configuration.attributeMapping as Record<string, string>;
    const claims = mappedProfile(profile, mapping);
    const workspace = organization.workspaces[0];
    let identity = await db.samlIdentity.findUnique({ where: { organizationId_issuer_nameId: { organizationId: organization.id, issuer: profile.issuer, nameId: profile.nameID } }, include: { user: true } });
    if (!identity) {
      const domain = claims.email.split("@")[1];
      const allowed = organization.allowJitProvisioning && domain && organization.domains.some(item => item.domain === domain);
      if (!allowed || !claims.displayName || await db.user.findUnique({ where: { email: claims.email } })) throw new Error("identity_not_linked");
      identity = await db.$transaction(async tx => {
        const user = await tx.user.create({ data: { email: claims.email, name: claims.displayName } });
        await tx.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "MEMBER" } });
        await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "MEMBER" } });
        return tx.samlIdentity.create({ data: { organizationId: organization.id, userId: user.id, issuer: profile.issuer, nameId: profile.nameID, nameIdFormat: profile.nameIDFormat, lastLoginAt: new Date() }, include: { user: true } });
      });
    } else {
      const active = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: organization.id, userId: identity.userId } } });
      if (!active || active.deactivatedAt) throw new Error("inactive_identity");
      await db.samlIdentity.update({ where: { id: identity.id }, data: { lastLoginAt: new Date() } });
    }
    const workspaceMembership = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: identity.userId } } });
    if (!workspaceMembership || workspaceMembership.deactivatedAt) throw new Error("inactive_workspace_membership");
    await createSession(identity.userId, workspace.id);
    await db.$transaction([
      db.samlConfiguration.update({ where: { id: configuration.id }, data: { testedAt: new Date(), lastErrorCode: null } }),
      db.auditEvent.create({ data: { workspaceId: workspace.id, actorId: identity.userId, action: "identity.saml.login", targetType: "user", targetId: identity.userId, metadata: { issuer: configuration.idpIssuer, groupCount: claims.groups.length, initiatedBy: relay ? "sp" : "idp" } } }),
    ]);
    return redirect(relay?.returnPath ?? "/");
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 100) : "validation_failed";
    await db.$transaction([
      db.samlConfiguration.update({ where: { id: configuration.id }, data: { lastErrorCode: code } }),
      db.auditEvent.create({ data: { workspaceId: organization.workspaces[0].id, action: "identity.saml.login_failed", targetType: "saml_configuration", targetId: configuration.id, metadata: { code } } }),
    ]);
    return redirect("/login?error=saml");
  }
}
