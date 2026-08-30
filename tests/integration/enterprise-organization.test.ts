import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createDomainChallenge, domainRecordName, normalizeDomain, verifyDomainChallenge } from "@/lib/enterprise-organization";

beforeEach(async () => {
  await db.workspace.deleteMany({ where: { slug: { startsWith: "enterprise-test-" } } });
  await db.organization.deleteMany({ where: { slug: { startsWith: "enterprise-test-" } } });
});
afterAll(() => db.$disconnect());

describe("enterprise organization boundaries", () => {
  it("normalizes only valid DNS names", () => {
    expect(normalizeDomain("Example.COM.")).toBe("example.com");
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("bad_domain.example")).toBeNull();
  });

  it("makes domain claims globally unique across tenants", async () => {
    const one = await db.organization.create({ data: { name: "One", slug: "enterprise-test-one", allowedDomains: [] } });
    const two = await db.organization.create({ data: { name: "Two", slug: "enterprise-test-two", allowedDomains: [] } });
    const challenge = createDomainChallenge();
    await db.organizationDomain.create({ data: { organizationId: one.id, domain: "unique.example", challengeHash: challenge.hash, challengeExpiresAt: challenge.expiresAt } });
    await expect(db.organizationDomain.create({ data: { organizationId: two.id, domain: "unique.example", challengeHash: challenge.hash, challengeExpiresAt: challenge.expiresAt } })).rejects.toThrow();
  });

  it("verifies an unexpired challenge once and rejects stale reuse", async () => {
    const organization = await db.organization.create({ data: { name: "Verify", slug: "enterprise-test-verify", allowedDomains: [] } });
    const challenge = createDomainChallenge();
    const domain = await db.organizationDomain.create({ data: { organizationId: organization.id, domain: "verify.example", challengeHash: challenge.hash, challengeExpiresAt: challenge.expiresAt } });
    const lookup = async (name: string) => { expect(name).toBe(domainRecordName(domain.domain)); return [[challenge.secret]]; };
    expect(await verifyDomainChallenge(domain, lookup)).toBe(true);
    expect(await verifyDomainChallenge({ ...domain, status: "VERIFIED" }, lookup)).toBe(false);
    const stale = await db.organizationDomain.create({ data: { organizationId: organization.id, domain: "stale.example", challengeHash: challenge.hash, challengeExpiresAt: new Date(0) } });
    expect(await verifyDomainChallenge(stale, lookup)).toBe(false);
  });

  it("prevents a workspace from being moved between organizations", async () => {
    const one = await db.organization.create({ data: { name: "One", slug: "enterprise-test-immutable-one", allowedDomains: [] } });
    const two = await db.organization.create({ data: { name: "Two", slug: "enterprise-test-immutable-two", allowedDomains: [] } });
    const workspace = await db.workspace.create({ data: { name: "Workspace", slug: "enterprise-test-workspace", organizationId: one.id } });
    const adopted = await db.workspace.updateMany({ where: { id: workspace.id, organizationId: null }, data: { organizationId: two.id } });
    expect(adopted.count).toBe(0);
    expect((await db.workspace.findUnique({ where: { id: workspace.id } }))?.organizationId).toBe(one.id);
  });
});
