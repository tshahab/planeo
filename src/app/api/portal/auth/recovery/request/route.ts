import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issuePortalToken } from "@/lib/portal-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const workspace = typeof body?.workspace === "string" ? body.workspace.trim().toLowerCase() : ""; const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const customer = await db.portalCustomer.findFirst({ where: { email, workspace: { slug: workspace }, verifiedAt: { not: null }, deactivatedAt: null } });
  if (customer) await db.$transaction(async (tx) => { await tx.portalCustomerToken.deleteMany({ where: { customerId: customer.id, purpose: "PASSWORD_RECOVERY", usedAt: null } }); const token = await issuePortalToken(tx, customer.id, "PASSWORD_RECOVERY", 30); await tx.emailDelivery.create({ data: { workspaceId: customer.workspaceId, recipient: customer.email, category: "PORTAL_PASSWORD_RECOVERY", subject: "Reset your portal password", textBody: `Reset your password: /portal/recover?token=${token}`, htmlBody: `<p>Reset your password: <a href="/portal/recover?token=${token}">Reset password</a></p>`, dedupeKey: `portal-recovery:${customer.id}:${Date.now()}`, correlationId: `portal-recovery:${customer.id}` } }); });
  return NextResponse.json({ message: "If the account exists, a recovery email has been queued." }, { status: 202 });
}
