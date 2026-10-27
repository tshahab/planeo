import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const queues = {
  email: db.emailDelivery,
  webhook: db.webhookDelivery,
  automation: db.automationJob,
  bulk: db.bulkOperation,
  chat: db.chatDelivery,
};
try {
  const status = {};
  let dead = 0;
  for (const [name, model] of Object.entries(queues)) {
    const groups = await model.groupBy({ by: ["status"], _count: { _all: true } });
    const counts = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
    status[name] = counts;
    dead += counts.DEAD ?? 0;
  }
  const result = { timestamp: new Date().toISOString(), queues: status, deadLetters: dead };
  console.log(JSON.stringify(result));
  if (dead > 0) process.exitCode = 2;
} finally {
  await db.$disconnect();
}
