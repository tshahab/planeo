import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE_NAME = "planeo_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

interface SessionClaims {
  userId: string;
  workspaceId: string;
  expiresAt: number;
}

export interface AuthContext {
  user: { id: string; email: string; name: string; avatarUrl: string | null };
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
  const claims: SessionClaims = { userId, workspaceId, expiresAt: Date.now() + SESSION_SECONDS * 1000 };
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
    if (!claims.userId || !claims.workspaceId || claims.expiresAt <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const claims = await readClaims();
  if (!claims) return null;
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: claims.workspaceId, userId: claims.userId } },
    include: { user: true, workspace: true },
  });
  if (!membership) return null;
  return {
    user: { id: membership.user.id, email: membership.user.email, name: membership.user.name, avatarUrl: membership.user.avatarUrl },
    workspace: { id: membership.workspace.id, name: membership.workspace.name, slug: membership.workspace.slug },
    role: membership.role,
  };
}
