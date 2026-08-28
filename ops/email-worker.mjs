import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL; if (!databaseUrl) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const endpoint = process.env.EMAIL_PROVIDER_URL ?? "http://mail-capture:8025/messages";
const maxAttempts = Number(process.env.EMAIL_MAX_ATTEMPTS ?? 5);
const pollMs = Number(process.env.EMAIL_POLL_MS ?? 2000);
const once = process.argv.includes("--once");
const safeError = (error) => String(error instanceof Error ? error.message : error).replace(/https?:\/\/\S+/g, "[REDACTED_URL]").slice(0, 500);

async function claim() {
  const rows = await prisma.$queryRaw`UPDATE "EmailDelivery" SET status = 'PROCESSING', "lockedAt" = NOW(), attempts = attempts + 1, "updatedAt" = NOW() WHERE id = (SELECT id FROM "EmailDelivery" WHERE (status = 'PENDING' AND "availableAt" <= NOW()) OR (status = 'PROCESSING' AND "lockedAt" < NOW() - INTERVAL '10 minutes') ORDER BY "availableAt" LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`;
  return rows[0];
}
async function deliver(item) {
  try { const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": item.dedupeKey, "x-correlation-id": item.correlationId }, body: JSON.stringify({ to: item.recipient, subject: item.subject, text: item.textBody, html: item.htmlBody }) }); if (!response.ok) throw new Error(`provider returned ${response.status}`); await prisma.emailDelivery.update({ where: { id: item.id }, data: { status: "DELIVERED", deliveredAt: new Date(), lockedAt: null, lastError: null } }); console.info(JSON.stringify({ event: "email.delivered", deliveryId: item.id, correlationId: item.correlationId, attempts: item.attempts })); }
  catch (error) { const dead = item.attempts >= maxAttempts; const delay = Math.min(60_000, 1000 * (2 ** Math.max(0, item.attempts - 1))); await prisma.emailDelivery.update({ where: { id: item.id }, data: { status: dead ? "DEAD" : "PENDING", lockedAt: null, availableAt: new Date(Date.now() + delay), lastError: safeError(error) } }); console.warn(JSON.stringify({ event: dead ? "email.dead" : "email.retry", deliveryId: item.id, correlationId: item.correlationId, attempts: item.attempts })); }
}
try { do { const item = await claim(); if (item) await deliver(item); else if (!once) await new Promise((resolve) => setTimeout(resolve, pollMs)); } while (!once); } finally { await prisma.$disconnect(); }
