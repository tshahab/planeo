import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { consumeRateLimit, requestClientKey } from "./security";

export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
export const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
export const SCIM_SCOPES = ["users:read", "users:write", "groups:read", "groups:write"] as const;
export type ScimScope = typeof SCIM_SCOPES[number];

export function createScimSecret() {
  const prefix = randomBytes(6).toString("hex");
  const secret = `scim_${prefix}.${randomBytes(32).toString("base64url")}`;
  return { prefix, secret, secretHash: createHash("sha256").update(secret).digest("hex") };
}

export function scimResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers: { "content-type": "application/scim+json", "cache-control": "no-store", ...headers } });
}

export function scimError(status: number, detail: string, scimType?: string) {
  return scimResponse({ schemas: [SCIM_ERROR_SCHEMA], status: String(status), ...(scimType ? { scimType } : {}), detail }, status);
}

export async function authenticateScim(request: Request, organizationIdentifier: string, scope: ScimScope | null) {
  const rate = await consumeRateLimit(`scim:${organizationIdentifier}:${requestClientKey(request)}`, Number(process.env.SCIM_RATE_LIMIT ?? 180), 60);
  if (!rate.allowed) return { error: scimError(429, "Rate limit exceeded.", "tooMany") };
  const header = request.headers.get("authorization") ?? "";
  const secret = header.startsWith("Bearer ") ? header.slice(7) : "";
  const match = /^scim_([a-f0-9]{12})\.[A-Za-z0-9_-]{20,}$/.exec(secret);
  if (!match) return { error: scimError(401, "A valid bearer token is required.") };
  const token = await db.scimToken.findUnique({ where: { prefix: match[1] }, include: { organization: true } });
  const expected = token ? Buffer.from(token.secretHash, "hex") : Buffer.alloc(32);
  const actual = Buffer.from(createHash("sha256").update(secret).digest("hex"), "hex");
  if (!token || token.organization.id !== organizationIdentifier && token.organization.slug !== organizationIdentifier || token.revokedAt || token.expiresAt && token.expiresAt <= new Date() || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { error: scimError(401, "The bearer token is invalid or expired.") };
  if (scope && !token.scopes.includes(scope)) return { error: scimError(403, `The ${scope} scope is required.`) };
  await db.scimToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
  return { token, organizationId: token.organizationId };
}

export function scimPage(url: string) {
  const params = new URL(url).searchParams;
  const startIndex = Math.max(1, Number.parseInt(params.get("startIndex") ?? "1", 10) || 1);
  const count = Math.min(100, Math.max(0, Number.parseInt(params.get("count") ?? "100", 10) || 100));
  return { startIndex, count, skip: startIndex - 1 };
}

export function parseScimFilter(value: string | null, allowed: readonly string[]) {
  if (!value) return null;
  const match = /^([A-Za-z][A-Za-z0-9.]*)\s+eq\s+"([^"\\]{1,500})"$/i.exec(value.trim());
  if (!match || !allowed.includes(match[1])) throw new Error("invalidFilter");
  return { attribute: match[1], value: match[2] };
}

export function scimUser(identity: { id: string; externalId: string | null; userName: string; active: boolean; version: number; createdAt: Date; updatedAt: Date; user: { name: string; email: string } }, baseUrl: string) {
  return { schemas: [SCIM_USER_SCHEMA], id: identity.id, externalId: identity.externalId ?? undefined, userName: identity.userName, active: identity.active, displayName: identity.user.name, name: { formatted: identity.user.name }, emails: [{ value: identity.user.email, type: "work", primary: true }], meta: { resourceType: "User", created: identity.createdAt.toISOString(), lastModified: identity.updatedAt.toISOString(), version: `W/\"${identity.version}\"`, location: `${baseUrl}/Users/${identity.id}` } };
}

export function scimGroup(group: { id: string; externalId: string | null; displayName: string; version: number; createdAt: Date; updatedAt: Date; members: Array<{ scimIdentityId: string; scimIdentity: { user: { name: string } } }> }, baseUrl: string) {
  return { schemas: [SCIM_GROUP_SCHEMA], id: group.id, externalId: group.externalId ?? undefined, displayName: group.displayName, members: group.members.map(member => ({ value: member.scimIdentityId, display: member.scimIdentity.user.name, $ref: `${baseUrl}/Users/${member.scimIdentityId}` })), meta: { resourceType: "Group", created: group.createdAt.toISOString(), lastModified: group.updatedAt.toISOString(), version: `W/\"${group.version}\"`, location: `${baseUrl}/Groups/${group.id}` } };
}

export async function scimLog(organizationId: string, tokenId: string | null, action: string, resourceType: string, resourceId: string | null, status: number, errorCode?: string, metadata?: Record<string, unknown>) {
  await db.scimProvisioningLog.create({ data: { organizationId, tokenId, action, resourceType, resourceId, status, errorCode, metadata: (metadata ?? {}) as Prisma.InputJsonValue } });
}

export function normalizeScimEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320 ? email : null;
}

export function scimBase(request: Request, organization: string) {
  return `${new URL(request.url).origin}/api/scim/v2/${encodeURIComponent(organization)}`;
}

export async function setScimActive(organizationId: string, identityId: string, active: boolean) {
  return db.$transaction(async tx => {
    const identity = await tx.scimIdentity.findFirst({ where: { id: identityId, organizationId } });
    if (!identity) return null;
    const workspaces = await tx.workspace.findMany({ where: { organizationId }, select: { id: true } });
    const workspaceIds = workspaces.map(item => item.id);
    const now = new Date();
    await tx.scimIdentity.update({ where: { id: identity.id }, data: { active, version: { increment: 1 } } });
    await tx.organizationMember.updateMany({ where: { organizationId, userId: identity.userId }, data: { deactivatedAt: active ? null : now } });
    await tx.workspaceMember.updateMany({ where: { userId: identity.userId, workspaceId: { in: workspaceIds } }, data: { deactivatedAt: active ? null : now } });
    if (!active) await tx.session.updateMany({ where: { userId: identity.userId, workspaceId: { in: workspaceIds }, revokedAt: null }, data: { revokedAt: now } });
    return tx.scimIdentity.findUnique({ where: { id: identity.id }, include: { user: true } });
  });
}
