import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { PortalTokenPurpose, Prisma } from "@prisma/client";
import { db } from "./db";

const COOKIE_NAME = "planeo_portal_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
type PortalClaims = { sessionId: string; customerId: string; workspaceId: string; expiresAt: number };
export type PortalContext = { customer: { id: string; email: string; name: string; locale: string; emailNotifications: boolean; issueReporterUserId: string }; workspace: { id: string; slug: string; name: string } };

function secret() { const value = process.env.SESSION_SECRET; if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters"); return value; }
function sign(value: string) { return createHmac("sha256", secret()).update(`portal:${value}`).digest("base64url"); }
function tokenHash(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function createPortalSession(customerId: string, workspaceId: string) {
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  const session = await db.portalCustomerSession.create({ data: { customerId, workspaceId, expiresAt: new Date(expiresAt) } });
  const claims: PortalClaims = { sessionId: session.id, customerId, workspaceId, expiresAt }; const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  (await cookies()).set(COOKIE_NAME, `${encoded}.${sign(encoded)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: SESSION_SECONDS, path: "/" });
}

export async function clearPortalSession() {
  const claims = await readClaims(); if (claims) await db.portalCustomerSession.updateMany({ where: { id: claims.sessionId, customerId: claims.customerId }, data: { revokedAt: new Date() } });
  (await cookies()).set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/" });
}

async function readClaims(): Promise<PortalClaims | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value; if (!value) return null; const [encoded, signature] = value.split("."); if (!encoded || !signature) return null;
  const expected = Buffer.from(sign(encoded)); const provided = Buffer.from(signature); if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try { const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PortalClaims; return claims.sessionId && claims.customerId && claims.workspaceId && claims.expiresAt > Date.now() ? claims : null; } catch { return null; }
}

export async function getPortalContext(): Promise<PortalContext | null> {
  const claims = await readClaims(); if (!claims) return null;
  const customer = await db.portalCustomer.findFirst({ where: { id: claims.customerId, workspaceId: claims.workspaceId, verifiedAt: { not: null }, deactivatedAt: null, sessions: { some: { id: claims.sessionId, revokedAt: null, expiresAt: { gt: new Date() } } } }, include: { workspace: true } });
  return customer ? { customer: { id: customer.id, email: customer.email, name: customer.name, locale: customer.locale, emailNotifications: customer.emailNotifications, issueReporterUserId: customer.issueReporterUserId }, workspace: { id: customer.workspace.id, slug: customer.workspace.slug, name: customer.workspace.name } } : null;
}

export async function issuePortalToken(tx: Prisma.TransactionClient, customerId: string, purpose: PortalTokenPurpose, lifetimeMinutes: number) {
  const token = randomBytes(32).toString("base64url");
  await tx.portalCustomerToken.create({ data: { customerId, purpose, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + lifetimeMinutes * 60_000) } });
  return token;
}

export async function consumePortalToken(tx: Prisma.TransactionClient, token: string, purpose: PortalTokenPurpose) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const record = await tx.portalCustomerToken.findFirst({ where: { tokenHash: tokenHash(token), purpose, usedAt: null, expiresAt: { gt: new Date() }, customer: { deactivatedAt: null } }, include: { customer: true } });
  if (!record) return null;
  const used = await tx.portalCustomerToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  return used.count === 1 ? record.customer : null;
}

export function portalProjectWhere(context: PortalContext): Prisma.ProjectWhereInput {
  return { workspaceId: context.workspace.id, template: "SERVICE", archivedAt: null, OR: [{ portalCustomers: { some: { customerId: context.customer.id, enabled: true } } }, { portalOrganizations: { some: { enabled: true, organization: { members: { some: { customerId: context.customer.id, active: true } } } } } }] };
}

export function portalRequestWhere(context: PortalContext): Prisma.ServiceRequestWhereInput {
  return { workspaceId: context.workspace.id, project: portalProjectWhere(context), issue: { securityLevelId: null, archivedAt: null }, OR: [
    { customerReporterId: context.customer.id },
    { sharing: { in: ["PARTICIPANTS", "ORGANIZATION"] }, participants: { some: { customerId: context.customer.id } } },
    { sharing: "ORGANIZATION", customerOrganization: { members: { some: { customerId: context.customer.id, active: true } }, projects: { some: { enabled: true, project: portalProjectWhere(context) } } } },
  ] };
}
