import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizationAdmin } from "@/lib/enterprise-organization";
import { createRelayState, samlClient } from "@/lib/saml";

export async function POST() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = await organizationAdmin(context.workspace.id, context.user.id);
  if (!admin) return NextResponse.json({ error: "Organization administration is required." }, { status: 403 });
  const configuration = await db.samlConfiguration.findUnique({ where: { organizationId: admin.organizationId } });
  if (!configuration?.encryptedSpPrivateKey) return NextResponse.json({ error: "Save a complete signing configuration first." }, { status: 409 });
  const relayState = createRelayState(admin.organizationId, "/settings/workspace?saml=test-complete", true);
  const destination = await samlClient(configuration).getAuthorizeUrlAsync(relayState, undefined, { additionalParams: { ForceAuthn: "true" } });
  await db.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "identity.saml.test_started", targetType: "saml_configuration", targetId: configuration.id, metadata: {} } });
  return NextResponse.json({ destination }, { headers: { "cache-control": "no-store" } });
}
