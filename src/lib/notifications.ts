import type { NotificationType, Prisma } from "@prisma/client";

export function mentionedEmails(text: string) {
  return [...new Set([...text.matchAll(/@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)].map((match) => match[1].toLowerCase()))];
}

export async function createIssueNotifications(tx: Prisma.TransactionClient, input: { workspaceId: string; issueId: string; issueKey: string; issueTitle: string; actorId: string; eventId: string; type: NotificationType; recipientIds: string[] }) {
  const recipientIds = [...new Set(input.recipientIds)].filter((id) => id !== input.actorId);
  if (!recipientIds.length) return;
  const label = input.type === "ASSIGNED" ? "assigned you" : input.type === "MENTIONED" ? "mentioned you" : input.type === "COMMENTED" ? "commented" : "updated an issue you watch";
  await tx.notification.createMany({
    skipDuplicates: true,
    data: recipientIds.map((userId) => ({ workspaceId: input.workspaceId, userId, issueId: input.issueId, actorId: input.actorId, type: input.type, title: `${input.issueKey}: ${label} — ${input.issueTitle}`, resourceUrl: `/projects/${input.issueKey.split("-")[0]}?issue=${input.issueId}&returnTo=/notifications`, dedupeKey: `${input.eventId}:${input.type}:${userId}` })),
  });
}
