import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { mayDeliverPortalEmail } from "./portal-email-access.mjs";
import { createEmailProvider } from "./email-provider.mjs";

const databaseUrl = process.env.DATABASE_URL; if (!databaseUrl) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const provider = createEmailProvider();
const maxAttempts = Number(process.env.EMAIL_MAX_ATTEMPTS ?? 5);
const pollMs = Number(process.env.EMAIL_POLL_MS ?? 2000);
const once = process.argv.includes("--once");
const safeError = (error) => String(error instanceof Error ? error.message : error).replace(/https?:\/\/\S+/g, "[REDACTED_URL]").slice(0, 500);

async function claim() {
  const rows = await prisma.$queryRaw`UPDATE "EmailDelivery" SET status = 'PROCESSING', "lockedAt" = NOW(), attempts = attempts + 1, "updatedAt" = NOW() WHERE id = (SELECT id FROM "EmailDelivery" WHERE (status = 'PENDING' AND "availableAt" <= NOW()) OR (status = 'PROCESSING' AND "lockedAt" < NOW() - INTERVAL '10 minutes') ORDER BY "availableAt" LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`;
  return rows[0];
}
async function deliver(item) {
  try {
  if (!await mayDeliverPortalEmail(prisma, item)) { await prisma.emailDelivery.update({ where: { id: item.id }, data: { status: "DEAD", lockedAt: null, lastError: "Recipient suppressed or request access revoked." } }); return; }
  await provider.send(item); await prisma.emailDelivery.update({ where: { id: item.id }, data: { status: "DELIVERED", deliveredAt: new Date(), lockedAt: null, lastError: null } }); console.info(JSON.stringify({ event: "email.delivered", provider: provider.kind, deliveryId: item.id, correlationId: item.correlationId, attempts: item.attempts })); }
  catch (error) { const dead = item.attempts >= maxAttempts; const delay = Math.min(60_000, 1000 * (2 ** Math.max(0, item.attempts - 1))); await prisma.emailDelivery.update({ where: { id: item.id }, data: { status: dead ? "DEAD" : "PENDING", lockedAt: null, availableAt: new Date(Date.now() + delay), lastError: safeError(error) } }); console.warn(JSON.stringify({ event: dead ? "email.dead" : "email.retry", deliveryId: item.id, correlationId: item.correlationId, attempts: item.attempts })); }
}
try { do { const item = await claim(); if (item) await deliver(item); else if (!once) await new Promise((resolve) => setTimeout(resolve, pollMs)); } while (!once); } finally { provider.close(); await prisma.$disconnect(); }
