import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(/* turbopackIgnore: true */ process.env.ATTACHMENT_STORAGE_ROOT ?? "/app/storage");

function resolveObject(objectKey: string) {
  const absolute = path.resolve(/* turbopackIgnore: true */ root, objectKey);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("Invalid storage object key");
  return absolute;
}

function signingSecret() {
  const value = process.env.ATTACHMENT_SIGNING_SECRET ?? process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("Attachment signing secret must contain at least 32 characters");
  return value;
}

export const attachmentStorage = {
  async put(objectKey: string, bytes: Uint8Array) {
    const absolute = resolveObject(objectKey);
    await mkdir(/* turbopackIgnore: true */ path.dirname(absolute), { recursive: true });
    await writeFile(/* turbopackIgnore: true */ absolute, bytes);
  },
  async get(objectKey: string) { return readFile(/* turbopackIgnore: true */ resolveObject(objectKey)); },
  async delete(objectKey: string) { await unlink(/* turbopackIgnore: true */ resolveObject(objectKey)).catch(() => undefined); },
  async ready() {
    await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
    await stat(/* turbopackIgnore: true */ root);
  },
};

export function attachmentDownloadUrl(workspaceId: string, attachmentId: string, lifetimeSeconds = 300) {
  const expires = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  const signature = sign(workspaceId, attachmentId, expires);
  return `/api/attachments/${attachmentId}?expires=${expires}&signature=${signature}`;
}

export function verifyAttachmentSignature(workspaceId: string, attachmentId: string, expires: number, signature: string) {
  if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + 900) return false;
  const expected = Buffer.from(sign(workspaceId, attachmentId, expires));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function sign(workspaceId: string, attachmentId: string, expires: number) {
  return createHmac("sha256", signingSecret()).update(`${workspaceId}:${attachmentId}:${expires}`).digest("base64url");
}
