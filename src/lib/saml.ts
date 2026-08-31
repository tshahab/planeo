import { createHmac, timingSafeEqual } from "node:crypto";
import { SAML, ValidateInResponseTo, type CacheProvider, type Profile } from "@node-saml/node-saml";
import { XMLParser } from "fast-xml-parser";
import { db } from "./db";
import { decryptSecret } from "./webhooks";

const REQUEST_TTL_MS = 10 * 60 * 1000;
const ASSERTION_TTL_MS = 8 * 60 * 60 * 1000;
export const DEFAULT_SAML_MAPPING = { email: "email", displayName: "displayName", groups: "groups" };

function appUrl() {
  const value = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("PUBLIC_APP_URL must use HTTPS in production");
  return url.origin;
}

function relaySecret() {
  const value = process.env.SAML_RELAY_SECRET ?? process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SAML_RELAY_SECRET or SESSION_SECRET must contain at least 32 characters");
  return value;
}

export function safeReturnPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return "/";
  return value.slice(0, 500);
}

export function createRelayState(organizationId: string, returnPath: string, test = false) {
  const payload = Buffer.from(JSON.stringify({ organizationId, returnPath: safeReturnPath(returnPath), expiresAt: Date.now() + REQUEST_TTL_MS, test })).toString("base64url");
  const signature = createHmac("sha256", relaySecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readRelayState(value: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  if (Buffer.from(payload, "base64url").toString("base64url") !== payload || Buffer.from(signature, "base64url").toString("base64url") !== signature) return null;
  const expected = createHmac("sha256", relaySecret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { organizationId?: unknown; returnPath?: unknown; expiresAt?: unknown; test?: unknown };
    if (typeof parsed.organizationId !== "string" || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) return null;
    return { organizationId: parsed.organizationId, returnPath: safeReturnPath(parsed.returnPath), test: parsed.test === true };
  } catch { return null; }
}

class DatabaseSamlCache implements CacheProvider {
  constructor(private organizationId: string) {}
  async saveAsync(key: string, value: string) {
    const createdAt = Date.now();
    await db.samlRequest.create({ data: { organizationId: this.organizationId, requestId: key, relayPath: value.slice(0, 500), expiresAt: new Date(createdAt + REQUEST_TTL_MS) } });
    return { value, createdAt };
  }
  async getAsync(key: string) {
    const request = await db.samlRequest.findFirst({ where: { organizationId: this.organizationId, requestId: key, consumedAt: null, expiresAt: { gt: new Date() } } });
    return request?.relayPath ?? null;
  }
  async removeAsync(key: string | null) {
    if (!key) return null;
    const request = await db.samlRequest.findFirst({ where: { organizationId: this.organizationId, requestId: key, consumedAt: null, expiresAt: { gt: new Date() } } });
    if (!request) return null;
    const consumed = await db.samlRequest.updateMany({ where: { id: request.id, consumedAt: null }, data: { consumedAt: new Date() } });
    return consumed.count === 1 ? request.relayPath : null;
  }
}

type StoredConfiguration = {
  organizationId: string; entityId: string; entryPoint: string; idpIssuer: string; idpCertificates: string[];
  encryptedSpPrivateKey: string | null; encryptedDecryptionPrivateKey: string | null; allowIdpInitiated: boolean;
};

export function samlClient(configuration: StoredConfiguration) {
  const callbackUrl = `${appUrl()}/api/auth/saml/${encodeURIComponent(configuration.organizationId)}/callback`;
  return new SAML({
    issuer: configuration.entityId,
    callbackUrl,
    entryPoint: configuration.entryPoint,
    idpIssuer: configuration.idpIssuer,
    idpCert: configuration.idpCertificates,
    privateKey: configuration.encryptedSpPrivateKey ? decryptSecret(configuration.encryptedSpPrivateKey) : undefined,
    decryptionPvk: configuration.encryptedDecryptionPrivateKey ? decryptSecret(configuration.encryptedDecryptionPrivateKey) : undefined,
    signatureAlgorithm: "sha256",
    digestAlgorithm: "sha256",
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    audience: configuration.entityId,
    acceptedClockSkewMs: 90_000,
    maxAssertionAgeMs: ASSERTION_TTL_MS,
    requestIdExpirationPeriodMs: REQUEST_TTL_MS,
    validateInResponseTo: configuration.allowIdpInitiated ? ValidateInResponseTo.ifPresent : ValidateInResponseTo.always,
    cacheProvider: new DatabaseSamlCache(configuration.organizationId),
    disableRequestedAuthnContext: false,
  });
}

function array<T>(value: T | T[] | undefined): T[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
export function normalizeCertificate(value: string) {
  const body = value.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, "");
  if (!/^[A-Za-z0-9+/=]{100,12000}$/.test(body)) throw new Error("invalid_certificate");
  return `-----BEGIN CERTIFICATE-----\n${body.match(/.{1,64}/g)?.join("\n")}\n-----END CERTIFICATE-----`;
}

export function parseIdpMetadata(xml: string) {
  if (!xml || Buffer.byteLength(xml) > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("invalid_metadata");
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, processEntities: false }).parse(xml) as Record<string, unknown>;
  const descriptor = (parsed.EntityDescriptor ?? parsed.EntitiesDescriptor) as Record<string, unknown> | undefined;
  const idp = descriptor?.IDPSSODescriptor as Record<string, unknown> | undefined;
  const services = array(idp?.SingleSignOnService as Record<string, unknown> | Array<Record<string, unknown>> | undefined);
  const service = services.find(item => String(item["@_Binding"] ?? "").includes("HTTP-Redirect")) ?? services[0];
  const keys = array(idp?.KeyDescriptor as Record<string, unknown> | Array<Record<string, unknown>> | undefined);
  const certificates = keys.flatMap(key => {
    const info = key.KeyInfo as Record<string, unknown> | undefined;
    const data = info?.X509Data as Record<string, unknown> | undefined;
    return array(data?.X509Certificate as string | string[] | undefined).map(normalizeCertificate);
  });
  const issuer = String(descriptor?.["@_entityID"] ?? "");
  const entryPoint = String(service?.["@_Location"] ?? "");
  if (!issuer || !entryPoint || !certificates.length || new URL(entryPoint).protocol !== "https:") throw new Error("invalid_metadata");
  return { issuer, entryPoint, certificates: [...new Set(certificates)] };
}

export function mappedProfile(profile: Profile, mapping: Record<string, string>) {
  const text = (key: string) => typeof profile[mapping[key]] === "string" ? String(profile[mapping[key]]).trim() : "";
  const email = (text("email") || profile.email || profile.mail || "").toString().trim().toLowerCase();
  const displayName = text("displayName").slice(0, 100);
  const rawGroups = profile[mapping.groups];
  const groups = array(typeof rawGroups === "string" || Array.isArray(rawGroups) ? rawGroups as string | string[] : undefined).map(String).filter(Boolean).slice(0, 100);
  return { email, displayName, groups };
}

export function assertionIdentifier(profile: Profile) {
  if (typeof profile.ID === "string" && profile.ID) return profile.ID;
  const parsed = profile.getAssertion?.() as { Assertion?: { $?: { ID?: unknown } } } | undefined;
  const id = parsed?.Assertion?.$?.ID;
  return typeof id === "string" ? id : "";
}

export async function consumeAssertion(organizationId: string, assertionId: string) {
  if (!assertionId || assertionId.length > 500) return false;
  try {
    await db.samlAssertionReplay.create({ data: { organizationId, assertionId, expiresAt: new Date(Date.now() + ASSERTION_TTL_MS) } });
    return true;
  } catch { return false; }
}
