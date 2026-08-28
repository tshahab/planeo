import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const now = new Date();
try {
  const retention = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const idempotencyRetention = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [rateLimits, invitations, sessions, passwordResets, webhookDeliveries, apiIdempotency] = await db.$transaction([
    db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } }),
    db.workspaceInvitation.updateMany({ where: { status: "PENDING", expiresAt: { lt: now } }, data: { status: "EXPIRED" } }),
    db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] } }),
    db.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
    db.webhookDelivery.deleteMany({ where: { status: { in: ["DELIVERED", "DEAD"] }, updatedAt: { lt: retention } } }),
    db.apiIdempotency.deleteMany({ where: { createdAt: { lt: idempotencyRetention } } }),
  ]);
  console.log(JSON.stringify({ event: "maintenance.completed", rateLimits: rateLimits.count, invitations: invitations.count, sessions: sessions.count, passwordResets: passwordResets.count, webhookDeliveries: webhookDeliveries.count, apiIdempotency: apiIdempotency.count }));
} finally {
  await db.$disconnect();
}
