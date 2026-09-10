import type { PrismaClient, EmailDelivery } from "@prisma/client";
export function mayDeliverPortalEmail(db: PrismaClient, item: EmailDelivery): Promise<boolean>;
