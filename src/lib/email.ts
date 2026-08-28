import type { Prisma } from "@prisma/client";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function absoluteAppUrl(path: string) {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function emailTemplate(input: { heading: string; message: string; actionLabel: string; actionUrl: string }) {
  const heading = escapeHtml(input.heading); const message = escapeHtml(input.message); const url = escapeHtml(input.actionUrl); const label = escapeHtml(input.actionLabel);
  return {
    textBody: `${input.heading}\n\n${input.message}\n\n${input.actionLabel}: ${input.actionUrl}\n\nIf you did not expect this message, you can ignore it.`,
    htmlBody: `<!doctype html><html lang="en"><body style="font-family:system-ui,sans-serif;color:#1f2430"><main><h1 style="font-size:22px">${heading}</h1><p>${message}</p><p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#6558d7;color:#fff;border-radius:6px">${label}</a></p><p style="color:#5f6877;font-size:13px">If you did not expect this message, you can ignore it.</p></main></body></html>`,
  };
}

export async function enqueueEmail(tx: Prisma.TransactionClient, input: { workspaceId?: string; userId?: string; issueId?: string; category: string; recipient: string; subject: string; message: string; actionLabel: string; actionPath: string; dedupeKey: string; correlationId: string }) {
  const actionUrl = absoluteAppUrl(input.actionPath); const template = emailTemplate({ heading: input.subject, message: input.message, actionLabel: input.actionLabel, actionUrl });
  await tx.emailDelivery.upsert({ where: { dedupeKey: input.dedupeKey }, update: {}, create: { workspaceId: input.workspaceId, userId: input.userId, issueId: input.issueId, category: input.category, recipient: input.recipient, subject: input.subject, ...template, dedupeKey: input.dedupeKey, correlationId: input.correlationId } });
}
