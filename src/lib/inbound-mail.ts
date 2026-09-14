import { createHmac, timingSafeEqual } from "node:crypto";
import { simpleParser } from "mailparser";

export const MAX_MAIL_BYTES = 2 * 1024 * 1024;
export class MailRejected extends Error { constructor(public reason: string) { super(reason); } }
export function verifyInboundSignature(secret: string, timestamp: string, raw: Buffer, signature: string, now = Date.now()) {
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(timestamp).update(".").update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export async function boundedMailBody(request: Request, max = MAX_MAIL_BYTES) {
  const reader = request.body?.getReader(); if (!reader) throw new MailRejected("empty_message");
  let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > max) { await reader.cancel(); throw new MailRejected("message_too_large"); } chunks.push(item.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export function messageId(value: unknown): string {
  if (typeof value !== "string" || value.length > 254 || !/^<[^<>\s@]{1,120}@[^<>\s@]{1,120}>$/.test(value)) throw new MailRejected("invalid_thread_headers");
  return value;
}
export async function normalizeMail(raw: Buffer) {
  if (!raw.length || raw.length > MAX_MAIL_BYTES) throw new MailRejected("message_too_large");
  const headerEnd = raw.indexOf("\r\n\r\n") >= 0 ? raw.indexOf("\r\n\r\n") : raw.indexOf("\n\n");
  if (headerEnd < 0 || headerEnd > 32768) throw new MailRejected("invalid_headers");
  const headers = raw.subarray(0, headerEnd).toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  for (const key of ["from", "message-id", "in-reply-to", "subject"]) if ((headers.match(new RegExp(`^${key}:`, "gmi")) ?? []).length > 1) throw new MailRejected("duplicate_headers");
  const parsed = await simpleParser(raw, { skipTextToHtml: true, skipImageLinks: true, skipTextLinks: true, maxHtmlLengthToParse: 100000 });
  if (parsed.from?.value.length !== 1 || !parsed.from.value[0].address) throw new MailRejected("invalid_sender");
  const sender = parsed.from.value[0].address.toLowerCase();
  if (!/^[^\s@<>]{1,64}@[^\s@<>]{1,190}$/.test(sender)) throw new MailRejected("invalid_sender");
  const auto = String(parsed.headers.get("auto-submitted") ?? "no").toLowerCase();
  if (auto !== "no" || /^(bulk|list|junk)$/i.test(String(parsed.headers.get("precedence") ?? "")) || parsed.headers.has("list-id") || parsed.headers.has("x-planeo-loop") || parsed.headers.has("x-autoreply") || parsed.headers.has("x-autorespond")) throw new MailRejected("automatic_message");
  const id = messageId(parsed.messageId);
  const references = parsed.references ? Array.isArray(parsed.references) ? parsed.references : [parsed.references] : [];
  if (references.length > 30) throw new MailRejected("too_many_references");
  const replyTo = parsed.inReplyTo ? messageId(parsed.inReplyTo) : null;
  const threadIds = [...new Set([...references.map(messageId), ...(replyTo ? [replyTo] : [])])];
  const subject = (parsed.subject ?? "").replace(/[\r\n\x00-\x1f]/g, " ").trim();
  const text = (parsed.text ?? "").replace(/\x00/g, "").trim();
  if (!subject || subject.length > 200 || !text || text.length > 20000) throw new MailRejected("invalid_content");
  if (parsed.attachments.length > 10 || parsed.attachments.reduce((sum, file) => sum + file.size, 0) > MAX_MAIL_BYTES) throw new MailRejected("too_many_attachments");
  const attachments = parsed.attachments.map(file => {
    const filename = (file.filename ?? "attachment").replace(/[\\/\x00-\x1f\x7f]/g, "_").slice(0, 150);
    const type = file.contentType.toLowerCase(), bytes = file.content;
    const allowed = type === "text/plain" && /\.txt$/i.test(filename) && !bytes.includes(0)
      || type === "image/png" && /\.png$/i.test(filename) && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      || type === "image/jpeg" && /\.jpe?g$/i.test(filename) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      || type === "application/pdf" && /\.pdf$/i.test(filename) && bytes.subarray(0, 5).toString() === "%PDF-";
    return { filename, contentType: type, size: file.size, content: bytes, quarantined: !allowed };
  });
  // Only normalized plain text leaves this boundary. Raw HTML is never rendered.
  return { id, sender, subject, text, threadIds, attachments };
}
