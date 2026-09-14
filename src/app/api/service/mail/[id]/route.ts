import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/webhooks";
import { boundedMailBody, MailRejected, verifyInboundSignature } from "@/lib/inbound-mail";
import { processInboundMail } from "@/lib/service-email";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const mailbox = await db.serviceMailbox.findFirst({ where: { id: (await params).id, enabled: true }, select: { id: true, encryptedSecret: true } });
    const raw = await boundedMailBody(request, 2900000);
    if (!mailbox || !verifyInboundSignature(decryptSecret(mailbox.encryptedSecret), request.headers.get("x-mail-timestamp") ?? "", raw, request.headers.get("x-mail-signature") ?? "")) return NextResponse.json({ error: "Invalid provider signature." }, { status: 401 });
    // The signature covers recipient, provider ID and the provider-attested sender as well
    // as MIME bytes. Raw Authentication-Results headers confer no authority.
    const result = await processInboundMail(mailbox.id, JSON.parse(raw.toString("utf8")));
    return NextResponse.json(result, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof MailRejected ? error.reason : "Message could not be processed." }, { status: error instanceof MailRejected && error.reason === "message_too_large" ? 413 : 400 }); }
}
