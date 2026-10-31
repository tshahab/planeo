import { createHash } from "node:crypto";
import { db } from "./db";

export async function consumeRateLimit(identifier: string, limit: number, windowSeconds: number) {
  const key = createHash("sha256").update(identifier).digest("hex");
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  return db.$transaction(async (tx) => {
    const existing = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!existing) {
      await tx.rateLimitBucket.create({ data: { key, resetAt } });
      return { allowed: true, remaining: limit - 1, resetAt };
    }
    if (existing.resetAt <= now) {
      await tx.rateLimitBucket.update({ where: { key }, data: { count: 1, resetAt } });
      return { allowed: true, remaining: limit - 1, resetAt };
    }
    if (existing.count >= limit) return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    const updated = await tx.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
    return { allowed: true, remaining: Math.max(0, limit - updated.count), resetAt: existing.resetAt };
  });
}

export function requestClientKey(request: Request) {
  // OpenShift's router supplies X-Real-IP and appends the original client to
  // X-Forwarded-For. Prefer the router's canonical value and only use the
  // left-most forwarded address as a fallback; accepting the right-most value
  // lets a caller spoof a fresh bucket on every request.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean)[0];
  return forwarded || "unknown";
}
