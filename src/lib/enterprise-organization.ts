import { createHash, randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { db } from "./db";

export const DOMAIN_CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000;
export const domainRecordName = (domain: string) => `_planeo-verification.${domain}`;
export const hashDomainChallenge = (value: string) => createHash("sha256").update(value).digest("hex");

export function normalizeDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return null;
  return domain;
}

export function createDomainChallenge() {
  const secret = randomBytes(32).toString("base64url");
  return { secret, hash: hashDomainChallenge(secret), expiresAt: new Date(Date.now() + DOMAIN_CHALLENGE_TTL_MS) };
}

export async function verifyDomainChallenge(domain: { id: string; domain: string; challengeHash: string; challengeExpiresAt: Date; status: string }, lookup = resolveTxt) {
  if (domain.status !== "PENDING" || domain.challengeExpiresAt <= new Date()) return false;
  const records = await lookup(domainRecordName(domain.domain)).catch(() => [] as string[][]);
  const matched = records.flat().some(value => hashDomainChallenge(value.trim()) === domain.challengeHash);
  if (!matched) return false;
  const updated = await db.organizationDomain.updateMany({
    where: { id: domain.id, status: "PENDING", challengeHash: domain.challengeHash, challengeExpiresAt: { gt: new Date() } },
    data: { status: "VERIFIED", verifiedAt: new Date(), verifiedChallengeHash: domain.challengeHash },
  });
  return updated.count === 1;
}

export async function organizationAdmin(workspaceId: string, userId: string) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { organizationId: true } });
  if (!workspace?.organizationId) return null;
  const member = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: workspace.organizationId, userId } } });
  return member && !member.deactivatedAt && (member.role === "OWNER" || member.role === "ADMIN") ? { organizationId: workspace.organizationId, member } : null;
}

export async function canUseLocalLogin(userId: string, workspaceId: string) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { organization: { include: { members: { where: { userId } } } } } });
  const organization = workspace?.organization;
  if (!organization || !organization.enforceSso || organization.allowLocalLogin) return true;
  const membership = organization.members[0];
  return Boolean(membership?.breakGlass && membership.recoveryConfirmedAt && !membership.deactivatedAt);
}

export async function effectiveSessionLifetimeSeconds(workspaceId: string) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { organization: { select: { sessionLifetimeMinutes: true } } } });
  return (workspace?.organization?.sessionLifetimeMinutes ?? 10080) * 60;
}
