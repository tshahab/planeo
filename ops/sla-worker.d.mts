import type { PrismaClient } from "@prisma/client";
export function processSlaRequest(db: PrismaClient, requestId: string, now?: Date): Promise<boolean>;
export function processSlaBatch(db: PrismaClient, now?: Date): Promise<number>;
