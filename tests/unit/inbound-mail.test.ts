import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { boundedMailBody, normalizeMail, verifyInboundSignature } from "@/lib/inbound-mail";
const mail = (headers = "", text = "Help please") => Buffer.from(`From: Customer <customer@example.test>\r\nTo: help@example.test\r\nMessage-ID: <unique@example.test>\r\nSubject: Help\r\n${headers}\r\n${text}`);
describe("inbound email trust boundary", () => {
  it("requires a fresh constant-time signature over the original bytes", () => {
    const raw = mail(), timestamp = "1789060000", secret = "test-only-secret";
    const signature = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex");
    expect(verifyInboundSignature(secret, timestamp, raw, signature, Number(timestamp) * 1000)).toBe(true);
    expect(verifyInboundSignature(secret, timestamp, Buffer.concat([raw, Buffer.from("!")]), signature, Number(timestamp) * 1000)).toBe(false);
    expect(verifyInboundSignature(secret, timestamp, raw, signature, Number(timestamp) * 1000 + 301000)).toBe(false);
  });
  it("normalizes MIME and threads independently of subject without returning HTML", async () => {
    const parsed = await normalizeMail(mail("In-Reply-To: <parent@example.test>\r\nContent-Type: text/html; charset=utf-8\r\n", "<p>Help</p><script>bad()</script>"));
    expect(parsed.threadIds).toEqual(["<parent@example.test>"]); expect(parsed.sender).toBe("customer@example.test");
    expect(parsed).not.toHaveProperty("html"); expect(parsed.text).not.toContain("<script>");
  });
  it("rejects loops, ambiguous headers and oversized input before parsing", async () => {
    await expect(normalizeMail(mail("Auto-Submitted: auto-replied\r\n"))).rejects.toMatchObject({ reason: "automatic_message" });
    await expect(normalizeMail(mail("From: attacker@example.test\r\n"))).rejects.toMatchObject({ reason: "duplicate_headers" });
    await expect(boundedMailBody(new Request("http://localhost", { method: "POST", body: "12345" }), 4)).rejects.toMatchObject({ reason: "message_too_large" });
  });
  it("quarantines executable attachments even when the claimed MIME type is benign", async () => {
    const raw = mail('Content-Type: multipart/mixed; boundary="test"\r\n', '--test\r\nContent-Type: text/plain\r\n\r\nHelp\r\n--test\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename="payload.exe"\r\n\r\nMZpayload\r\n--test--');
    expect((await normalizeMail(raw)).attachments[0].quarantined).toBe(true);
  });
});
