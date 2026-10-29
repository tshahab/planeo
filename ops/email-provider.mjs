import nodemailer from "nodemailer";

const boolean = (value, fallback = false) => value == null || value === "" ? fallback : value === "true";

export function createEmailProvider(env = process.env, dependencies = {}) {
  const smtpHost = env.SMTP_HOST?.trim();
  if (smtpHost) {
    const port = Number(env.SMTP_PORT ?? 25);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT must be an integer from 1 through 65535");
    const from = env.SMTP_FROM?.trim();
    if (!from) throw new Error("SMTP_FROM is required when SMTP_HOST is configured");
    const username = env.SMTP_USERNAME?.trim();
    const password = env.SMTP_PASSWORD;
    if (Boolean(username) !== Boolean(password)) throw new Error("SMTP_USERNAME and SMTP_PASSWORD must be configured together");
    const createTransport = dependencies.createTransport ?? nodemailer.createTransport;
    const transport = createTransport({
      host: smtpHost,
      port,
      secure: boolean(env.SMTP_SECURE, port === 465),
      requireTLS: boolean(env.SMTP_REQUIRE_TLS),
      tls: { rejectUnauthorized: boolean(env.SMTP_TLS_REJECT_UNAUTHORIZED, true) },
      auth: username ? { user: username, pass: password } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return {
      kind: "smtp",
      async send(item) {
        await transport.sendMail({
          from,
          to: item.recipient,
          subject: item.subject,
          text: item.textBody,
          html: item.htmlBody,
          headers: item.mailHeaders ?? {},
        });
      },
      close() { transport.close?.(); },
    };
  }

  const endpoint = env.EMAIL_PROVIDER_URL?.trim() || "http://mail-capture:8025/messages";
  const fetchImpl = dependencies.fetch ?? fetch;
  return {
    kind: "http",
    async send(item) {
      const response = await fetchImpl(endpoint, {
        signal: AbortSignal.timeout(10_000),
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": item.dedupeKey, "x-correlation-id": item.correlationId },
        body: JSON.stringify({ to: item.recipient, subject: item.subject, text: item.textBody, html: item.htmlBody, headers: item.mailHeaders ?? {} }),
      });
      if (!response.ok) throw new Error(`provider returned ${response.status}`);
    },
    close() {},
  };
}
