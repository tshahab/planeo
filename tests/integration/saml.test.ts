import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { assertionIdentifier, consumeAssertion, samlClient } from "@/lib/saml";
import { encryptSecret } from "@/lib/webhooks";
import { IdentityProvider, ServiceProvider, setSchemaValidator } from "samlify";
import { TEST_SAML_CERTIFICATE, TEST_SAML_PRIVATE_KEY } from "../fixtures/saml";

beforeEach(async () => {
  process.env.SESSION_SECRET = "saml-integration-secret-with-at-least-thirty-two-characters";
  process.env.PUBLIC_APP_URL = "http://localhost:3000";
  await db.organization.deleteMany({ where: { slug: { startsWith: "saml-test-" } } });
});
afterAll(() => db.$disconnect());

describe("SAML tenant and replay controls", () => {
  it("accepts a correlated signed response from the Docker IdP simulator", async () => {
    setSchemaValidator({ validate: async () => undefined });
    const organization = await db.organization.create({ data: { name: "Protocol", slug: "saml-test-protocol", allowedDomains: [] } });
    const callbackUrl = `http://localhost:3000/api/auth/saml/${organization.id}/callback`;
    const configuration = await db.samlConfiguration.create({ data: { organizationId: organization.id, entityId: "https://planeo.test/saml", entryPoint: "https://idp.example/sso", idpIssuer: "https://idp.example/entity", idpCertificates: [TEST_SAML_CERTIFICATE], encryptedSpPrivateKey: encryptSecret(TEST_SAML_PRIVATE_KEY), spCertificate: TEST_SAML_CERTIFICATE, allowIdpInitiated: false, attributeMapping: { email: "email", displayName: "displayName", groups: "groups" } } });
    const sp = ServiceProvider({ entityID: configuration.entityId, authnRequestsSigned: true, wantAssertionsSigned: true, privateKey: TEST_SAML_PRIVATE_KEY, signingCert: TEST_SAML_CERTIFICATE, assertionConsumerService: [{ Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST", Location: callbackUrl }] });
    const idp = IdentityProvider({ entityID: configuration.idpIssuer, privateKey: TEST_SAML_PRIVATE_KEY, signingCert: TEST_SAML_CERTIFICATE, wantAuthnRequestsSigned: true, singleSignOnService: [{ Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect", Location: configuration.entryPoint }] });
    const client = samlClient(configuration);
    const authorize = new URL(await client.getAuthorizeUrlAsync("relay-state", undefined, {}));
    const signedOctets = authorize.search.slice(1).replace(/&Signature=[^&]*$/, "");
    const requestInfo = await idp.parseLoginRequest(sp, "redirect", { query: Object.fromEntries(authorize.searchParams), octetString: signedOctets });
    const response = await idp.createLoginResponse(sp, requestInfo as unknown as Parameters<typeof idp.createLoginResponse>[1], "post", { email: "user@example.com" }, { relayState: "relay-state" });
    const validated = await client.validatePostResponseAsync({ SAMLResponse: response.context });
    expect(validated.loggedOut).toBe(false);
    expect(validated.profile?.issuer).toBe(configuration.idpIssuer);
    expect(validated.profile && assertionIdentifier(validated.profile)).toBeTruthy();
  });

  it("consumes an assertion identifier exactly once across organizations", async () => {
    const one = await db.organization.create({ data: { name: "One", slug: "saml-test-one", allowedDomains: [] } });
    const two = await db.organization.create({ data: { name: "Two", slug: "saml-test-two", allowedDomains: [] } });
    expect(await consumeAssertion(one.id, "assertion-1")).toBe(true);
    expect(await consumeAssertion(one.id, "assertion-1")).toBe(false);
    expect(await consumeAssertion(two.id, "assertion-1")).toBe(false);
  });

  it("does not allow the same stable identity in two tenant users", async () => {
    const organization = await db.organization.create({ data: { name: "Identity", slug: "saml-test-identity", allowedDomains: [] } });
    const nonce = `${Date.now()}-${Math.random()}`;
    const first = await db.user.create({ data: { email: `saml-first-${nonce}@example.test`, name: "First" } });
    const second = await db.user.create({ data: { email: `saml-second-${nonce}@example.test`, name: "Second" } });
    await db.samlIdentity.create({ data: { organizationId: organization.id, userId: first.id, issuer: "https://idp.example", nameId: "stable-id" } });
    await expect(db.samlIdentity.create({ data: { organizationId: organization.id, userId: second.id, issuer: "https://idp.example", nameId: "stable-id" } })).rejects.toThrow();
  });
});
