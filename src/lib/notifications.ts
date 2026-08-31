import type { NotificationType, Prisma } from "@prisma/client";
import { enqueueEmail } from "@/lib/email";
import { publishRealtime } from "@/lib/realtime";
import { matchesIssueSecurity, type SecurityGrants } from "@/lib/permissions";

export function mentionedEmails(text: string) {
  return [...new Set([...text.matchAll(/@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)].map((match) => match[1].toLowerCase()))];
}

export async function createIssueNotifications(tx: Prisma.TransactionClient, input: { workspaceId: string; issueId: string; issueKey: string; issueTitle: string; actorId: string; eventId: string; type: NotificationType; recipientIds: string[] }) {
  const recipientIds = [...new Set(input.recipientIds)].filter((id) => id !== input.actorId);
  if (!recipientIds.length) return;
  const label = input.type === "ASSIGNED" ? "assigned you" : input.type === "MENTIONED" ? "mentioned you" : input.type === "COMMENTED" ? "commented" : "updated an issue you watch";
  const issue = await tx.issue.findUnique({ where: { id: input.issueId }, select: { reporterId: true, assigneeId: true, projectId: true, securityLevel: { select: { grants: true } } } });
  if (!issue) return;
  const candidates = await tx.user.findMany({
    where: {
      id: { in: recipientIds },
      memberships: { some: { workspaceId: input.workspaceId, deactivatedAt: null } },
      OR: [
        { projectRoles: { some: { project: { issues: { some: { id: input.issueId } } } } } },
        { memberships: { some: { workspaceId: input.workspaceId, deactivatedAt: null, workspace: { projects: { some: { visibility: "PUBLIC", issues: { some: { id: input.issueId } } } } } } } },
      ],
    },
    select: { id: true, email: true, emailNotifications: true, inAppNotifications: true, memberships: { where: { workspaceId: input.workspaceId }, select: { role: true } }, projectRoles: { where: { projectId: issue.projectId }, select: { role: true } }, scimIdentities: { where: { active: true }, select: { groupMemberships: { select: { groupId: true } } } } },
  });
  const recipients = candidates.filter(recipient => matchesIssueSecurity(issue.securityLevel?.grants as SecurityGrants | null, { userId: recipient.id, workspaceRole: recipient.memberships[0].role, projectRole: recipient.projectRoles[0]?.role, groupIds: recipient.scimIdentities.flatMap(identity => identity.groupMemberships.map(member => member.groupId)) }, issue));
  const inAppRecipients = recipients.filter(({ inAppNotifications }) => inAppNotifications);
  if (inAppRecipients.length) await tx.notification.createMany({
    skipDuplicates: true,
    data: inAppRecipients.map(({ id: userId }) => ({ workspaceId: input.workspaceId, userId, issueId: input.issueId, actorId: input.actorId, type: input.type, title: `${input.issueKey}: ${label} — ${input.issueTitle}`, resourceUrl: `/projects/${input.issueKey.split("-")[0]}?issue=${input.issueId}&returnTo=/notifications`, dedupeKey: `${input.eventId}:${input.type}:${userId}` })),
  });
  if (inAppRecipients.length) await publishRealtime(tx, { workspaceId: input.workspaceId, type: "notification.updated", resourceId: input.issueId, payload: { recipientIds: inAppRecipients.map(({ id }) => id) } });
  for (const recipient of recipients.filter(({ emailNotifications }) => emailNotifications)) await enqueueEmail(tx, { workspaceId: input.workspaceId, userId: recipient.id, issueId: input.issueId, category: input.type, recipient: recipient.email, subject: `${input.issueKey}: ${label}`, message: input.issueTitle, actionLabel: "View issue", actionPath: `/projects/${input.issueKey.split("-")[0]}?issue=${input.issueId}`, dedupeKey: `issue:${input.eventId}:${input.type}:${recipient.id}`, correlationId: input.eventId });
}
