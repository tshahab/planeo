import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { consumeRateLimit, requestClientKey } from "@/lib/security";
import { createRelayState, safeReturnPath, samlClient } from "@/lib/saml";

export async function GET(request: Request, { params }: { params: Promise<{ organization: string }> }) {
  const rate = await consumeRateLimit(`saml-login:${requestClientKey(request)}`, 30, 60);
  if (!rate.allowed) return NextResponse.json({ error: "Too many authentication attempts." }, { status: 429 });
  const { organization: identifier } = await params;
  const organization = await db.organization.findFirst({ where: { OR: [{ id: identifier }, { slug: identifier }] }, include: { samlConfiguration: true } });
  const configuration = organization?.samlConfiguration;
  if (!organization || !configuration || !configuration.enabled) return NextResponse.json({ error: "Single sign-on is unavailable." }, { status: 404 });
  const returnPath = safeReturnPath(new URL(request.url).searchParams.get("returnTo"));
  const relayState = createRelayState(organization.id, returnPath);
  const destination = await samlClient(configuration).getAuthorizeUrlAsync(relayState, undefined, {});
  return NextResponse.redirect(destination, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
