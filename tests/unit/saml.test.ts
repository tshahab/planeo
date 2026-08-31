import { beforeEach, describe, expect, it } from "vitest";
import { createRelayState, mappedProfile, normalizeCertificate, parseIdpMetadata, readRelayState, safeReturnPath } from "@/lib/saml";

beforeEach(() => { process.env.SESSION_SECRET = "saml-test-secret-with-at-least-thirty-two-characters"; });

describe("SAML security boundary", () => {
  it("signs expiring tenant-bound relay state and rejects tampering", () => {
    const state = createRelayState("org-one", "/projects/ONE?tab=board");
    expect(readRelayState(state)).toMatchObject({ organizationId: "org-one", returnPath: "/projects/ONE?tab=board" });
    const [payload, signature] = state.split(".");
    expect(readRelayState(`${payload.slice(0, -1)}x.${signature}`)).toBeNull();
  });

  it("prevents external and protocol-relative return destinations", () => {
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("//evil.example/path")).toBe("/");
    expect(safeReturnPath("/safe/path")).toBe("/safe/path");
  });

  it("imports namespaced IdP metadata and preserves rollover certificates", () => {
    const certificate = "A".repeat(256);
    const metadata = `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example/entity"><md:IDPSSODescriptor><md:KeyDescriptor><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>${certificate}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:KeyDescriptor><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>${certificate.replaceAll("A", "B")}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example/sso"/></md:IDPSSODescriptor></md:EntityDescriptor>`;
    const result = parseIdpMetadata(metadata);
    expect(result.issuer).toBe("https://idp.example/entity");
    expect(result.entryPoint).toBe("https://idp.example/sso");
    expect(result.certificates).toHaveLength(2);
  });

  it("rejects metadata entity declarations and malformed certificates", () => {
    expect(() => parseIdpMetadata("<!DOCTYPE x [<!ENTITY y SYSTEM 'file:///etc/passwd'>]><x>&y;</x>")).toThrow("invalid_metadata");
    expect(() => normalizeCertificate("not a certificate")).toThrow("invalid_certificate");
  });

  it("maps only configured claims and bounds group fanout", () => {
    const profile = { issuer: "issuer", nameID: "stable", nameIDFormat: "persistent", mailClaim: "USER@EXAMPLE.COM", displayClaim: "User", groupClaim: Array.from({ length: 120 }, (_, index) => `g${index}`) };
    expect(mappedProfile(profile, { email: "mailClaim", displayName: "displayClaim", groups: "groupClaim" })).toEqual({ email: "user@example.com", displayName: "User", groups: expect.arrayContaining(["g0", "g99"]) });
    expect(mappedProfile(profile, { email: "mailClaim", displayName: "displayClaim", groups: "groupClaim" }).groups).toHaveLength(100);
  });
});
