import { describe, expect, it, vi } from "vitest";
import { createEmailProvider, type EmailItem } from "../../ops/email-provider.mjs";

const item: EmailItem = {
  recipient: "customer@example.test",
  subject: "Update",
  textBody: "Text",
  htmlBody: "<p>Text</p>",
  mailHeaders: { "In-Reply-To": "<request@example.test>" },
  dedupeKey: "delivery-1",
  correlationId: "correlation-1",
};

describe("email provider selection", () => {
  it("delivers through SMTP when SMTP_HOST is configured", async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: [item.recipient] });
    const close = vi.fn();
    const createTransport = vi.fn(() => ({ sendMail, close }));
    const provider = createEmailProvider({ SMTP_HOST: "smtp.internal", SMTP_PORT: "25", SMTP_FROM: "no-reply@example.test" }, { createTransport });
    expect(provider.kind).toBe("smtp");
    await provider.send(item);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.internal", port: 25, secure: false, tls: { rejectUnauthorized: true } }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "no-reply@example.test", to: item.recipient, subject: item.subject }));
    provider.close();
    expect(close).toHaveBeenCalled();
  });

  it("pins an explicitly trusted internal relay certificate", () => {
    type PinnedTransportOptions = {
      tls: {
        rejectUnauthorized: boolean;
        checkServerIdentity: (hostname: string, certificate: { fingerprint256?: string }) => Error | undefined;
      };
    };
    const createTransport = vi.fn((_options: Record<string, unknown>) => ({ sendMail: vi.fn().mockResolvedValue({}), close: vi.fn() }));
    createEmailProvider({
      SMTP_HOST: "smtp.internal",
      SMTP_FROM: "no-reply@example.test",
      SMTP_TLS_CERT_FINGERPRINTS: "AA:BB, ccdd",
    }, { createTransport });
    const options = createTransport.mock.calls[0][0] as unknown as PinnedTransportOptions;
    expect(options.tls.rejectUnauthorized).toBe(true);
    expect(options.tls.checkServerIdentity("smtp.internal", { fingerprint256: "AA:BB" })).toBeUndefined();
    expect(options.tls.checkServerIdentity("smtp.internal", { fingerprint256: "CC:DD" })).toBeUndefined();
  });

  it("requires a sender and complete optional authentication", () => {
    expect(() => createEmailProvider({ SMTP_HOST: "smtp.internal" })).toThrow(/SMTP_FROM/);
    expect(() => createEmailProvider({ SMTP_HOST: "smtp.internal", SMTP_FROM: "no-reply@example.test", SMTP_USERNAME: "user" })).toThrow(/configured together/);
    expect(() => createEmailProvider({ SMTP_HOST: "smtp.internal", SMTP_PORT: "70000", SMTP_FROM: "no-reply@example.test" })).toThrow(/SMTP_PORT/);
  });

  it("preserves the HTTP provider contract when SMTP is absent", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const provider = createEmailProvider({ EMAIL_PROVIDER_URL: "https://mail.example.test/messages" }, { fetch: fetch as unknown as typeof globalThis.fetch });
    expect(provider.kind).toBe("http");
    await provider.send(item);
    expect(fetch).toHaveBeenCalledWith("https://mail.example.test/messages", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "idempotency-key": item.dedupeKey, "x-correlation-id": item.correlationId }),
    }));
  });
});
