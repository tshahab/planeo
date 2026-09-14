import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/webhooks";
import { boundedMailBody, verifyInboundSignature } from "@/lib/inbound-mail";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const mailbox = await db.serviceMailbox.findFirst({ where: { id: (await params).id, enabled: true }, include: { project: true } }), raw = await boundedMailBody(request, 4096);
    if (!mailbox || !verifyInboundSignature(decryptSecret(mailbox.encryptedSecret), request.headers.get("x-mail-timestamp") ?? "", raw, request.headers.get("x-mail-signature") ?? "")) return NextResponse.json({ error: "Invalid provider signature." }, { status: 401 });
    const body = JSON.parse(raw.toString()), email = typeof body.email === "string" ? body.email.toLowerCase() : "";
    if (!["HARD_BOUNCE", "COMPLAINT"].includes(body.reason) || !await db.emailDelivery.count({ where: { workspaceId: mailbox.project.workspaceId, recipient: email, issue: { projectId: mailbox.projectId }, dedupeKey: String(body.deliveryKey) } })) return NextResponse.json({ error: "Invalid bounce." }, { status: 400 });
    await db.$transaction(async tx => {
      await tx.mailSuppression.upsert({ where: { workspaceId_email: { workspaceId: mailbox.project.workspaceId, email } }, create: { workspaceId: mailbox.project.workspaceId, email, reason: body.reason }, update: { reason: body.reason } });
      await tx.emailDelivery.update({ where: { dedupeKey: body.deliveryKey }, data: { status: "DEAD", lastError: body.reason } });
    }); return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Bounce could not be processed." }, { status: 400 }); }
}
