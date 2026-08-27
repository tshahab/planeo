import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import { logEvent, requestId } from "./observability";

const COOKIE_NAME = "planeo_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

interface SessionClaims {
  sessionId: string;
  userId: string;
  workspaceId: string;
  expiresAt: number;
}

export interface AuthContext {
  user: { id: string; email: string; name: string; avatarUrl: string | null; timezone: string; emailNotifications: boolean; inAppNotifications: boolean };
  workspace: { id: string; name: string; slug: string };
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  if (process.env.NODE_ENV === "production" && value === "docker-development-secret-change-before-production") throw new Error("The development SESSION_SECRET cannot be used in production");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, saltHex, hashHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function createSession(userId: string, workspaceId: string) {
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  const session = await db.session.create({ data: { userId, workspaceId, expiresAt: new Date(expiresAt) } });
  const claims: SessionClaims = { sessionId: session.id, userId, workspaceId, expiresAt };
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const value = `${encoded}.${sign(encoded)}`;
  (await cookies()).set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_SECONDS,
    path: "/",
  });
}

export async function clearSession() {
  const claims = await readClaims();
  if (claims?.sessionId) await db.session.updateMany({ where: { id: claims.sessionId, userId: claims.userId }, data: { revokedAt: new Date() } });
  (await cookies()).set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/" });
}

async function readClaims(): Promise<SessionClaims | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  try {
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionClaims;
    if (!claims.sessionId || !claims.userId || !claims.workspaceId || claims.expiresAt <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const claims = await readClaims();
  if (!claims) return null;
  const session = await db.session.findFirst({ where: { id: claims.sessionId, userId: claims.userId, workspaceId: claims.workspaceId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
  if (!session) return null;
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: claims.workspaceId, userId: claims.userId } },
    include: { user: true, workspace: true },
  });
  if (!membership || membership.deactivatedAt) return null;
  const context: AuthContext = {
    user: { id: membership.user.id, email: membership.user.email, name: membership.user.name, avatarUrl: membership.user.avatarUrl, timezone: membership.user.timezone, emailNotifications: membership.user.emailNotifications, inAppNotifications: membership.user.inAppNotifications },
    workspace: { id: membership.workspace.id, name: membership.workspace.name, slug: membership.workspace.slug },
    role: membership.role,
  };
  logEvent("info", "auth.context_resolved", { requestId: requestId(await headers()), workspaceId: context.workspace.id, userId: context.user.id });
  return context;
}

export async function revokeAllSessions(userId: string) { await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }); }
