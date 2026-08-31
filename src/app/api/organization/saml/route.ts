import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizationAdmin } from "@/lib/enterprise-organization";
import { encryptSecret } from "@/lib/webhooks";
import { DEFAULT_SAML_MAPPING, normalizeCertificate, parseIdpMetadata } from "@/lib/saml";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = await organizationAdmin(context.workspace.id, context.user.id);
  if (!admin) return NextResponse.json({ error: "Organization administration is required." }, { status: 403 });
  const configuration = await db.samlConfiguration.findUnique({ where: { organizationId: admin.organizationId } });
  if (!configuration) return NextResponse.json({ configuration: null });
  const { encryptedSpPrivateKey: _sp, encryptedDecryptionPrivateKey: _decryption, ...safe } = configuration;
  return NextResponse.json({ configuration: { ...safe, hasSpPrivateKey: Boolean(_sp), hasDecryptionPrivateKey: Boolean(_decryption) } }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = await organizationAdmin(context.workspace.id, context.user.id);
  if (!admin) return NextResponse.json({ error: "Organization administration is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "SAML configuration is required." }, { status: 400 });
  try {
    const metadata = typeof body.metadata === "string" && body.metadata.trim() ? parseIdpMetadata(body.metadata) : null;
    const current = await db.samlConfiguration.findUnique({ where: { organizationId: admin.organizationId } });
    const entryPoint = metadata?.entryPoint ?? String(body.entryPoint ?? current?.entryPoint ?? "").trim();
    const idpIssuer = metadata?.issuer ?? String(body.idpIssuer ?? current?.idpIssuer ?? "").trim();
    const entityId = String(body.entityId ?? current?.entityId ?? "").trim();
    const suppliedCertificates = Array.isArray(body.idpCertificates) ? body.idpCertificates.filter((item): item is string => typeof item === "string").map(normalizeCertificate) : [];
    const idpCertificates = metadata?.certificates ?? (suppliedCertificates.length ? suppliedCertificates : current?.idpCertificates ?? []);
    if (!entityId || entityId.length > 500 || !idpIssuer || idpIssuer.length > 1000 || !idpCertificates.length) throw new Error("invalid_configuration");
    const endpoint = new URL(entryPoint);
    if (endpoint.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && endpoint.hostname === "saml-idp-test")) throw new Error("invalid_entry_point");
    const mapping = { ...DEFAULT_SAML_MAPPING, ...(body.attributeMapping && typeof body.attributeMapping === "object" ? body.attributeMapping as Record<string, string> : {}) };
    for (const value of Object.values(mapping)) if (typeof value !== "string" || !value || value.length > 300) throw new Error("invalid_mapping");
    const encryptedSpPrivateKey = typeof body.spPrivateKey === "string" && body.spPrivateKey.trim() ? encryptSecret(body.spPrivateKey.trim()) : current?.encryptedSpPrivateKey;
    const encryptedDecryptionPrivateKey = typeof body.decryptionPrivateKey === "string" && body.decryptionPrivateKey.trim() ? encryptSecret(body.decryptionPrivateKey.trim()) : current?.encryptedDecryptionPrivateKey;
    const enabled = body.enabled === true;
    if (enabled && !encryptedSpPrivateKey) return NextResponse.json({ error: "A signing private key is required before SAML can be enabled." }, { status: 409 });
    if (enabled && !current?.testedAt) return NextResponse.json({ error: "Complete a successful test login before enabling SAML." }, { status: 409 });
    const data = { entityId, entryPoint: endpoint.toString(), idpIssuer, idpCertificates: [...new Set(idpCertificates)], encryptedSpPrivateKey, spCertificate: typeof body.spCertificate === "string" ? normalizeCertificate(body.spCertificate) : current?.spCertificate, encryptedDecryptionPrivateKey, decryptionCertificate: typeof body.decryptionCertificate === "string" ? normalizeCertificate(body.decryptionCertificate) : current?.decryptionCertificate, allowIdpInitiated: body.allowIdpInitiated === true, attributeMapping: mapping, enabled, testedAt: current?.testedAt, lastErrorCode: null };
    const configuration = await db.$transaction(async tx => {
      const saved = await tx.samlConfiguration.upsert({ where: { organizationId: admin.organizationId }, create: { organizationId: admin.organizationId, ...data }, update: data });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "identity.saml.configuration.updated", targetType: "saml_configuration", targetId: saved.id, metadata: { enabled, certificateCount: data.idpCertificates.length, allowIdpInitiated: data.allowIdpInitiated, signingKeyRotated: typeof body.spPrivateKey === "string", decryptionKeyRotated: typeof body.decryptionPrivateKey === "string" } } });
      return saved;
    });
    return NextResponse.json({ configuration: { id: configuration.id, enabled: configuration.enabled, testedAt: configuration.testedAt } });
  } catch (error) {
    return NextResponse.json({ error: "SAML configuration is invalid.", code: error instanceof Error ? error.message : "invalid_configuration" }, { status: 400 });
  }
}
