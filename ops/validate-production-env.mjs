const serviceRole = process.env.SERVICE_ROLE ?? "web";
const required = serviceRole === "email-worker"
  ? ["DATABASE_URL"]
  : ["DATABASE_URL", "SESSION_SECRET", "WEBHOOK_ENCRYPTION_SECRET", "ATTACHMENT_SIGNING_SECRET", "AUDIT_EXPORT_KEY"];
const forbidden = new Set([
  "docker-development-secret-change-before-production",
  "planeo-demo",
  "planeo-demo-password",
]);

const missing = required.filter((name) => !process.env[name] || process.env[name].length < 32);
const developmentValues = required.filter((name) => forbidden.has(process.env[name]));
const database = process.env.DATABASE_URL ?? "";
if (database && !/^postgres(?:ql)?:\/\//.test(database)) missing.push("DATABASE_URL (PostgreSQL URL required)");
const smtpHost = process.env.SMTP_HOST?.trim() ?? "";
const smtpPort = Number(process.env.SMTP_PORT ?? 25);
const smtpFrom = process.env.SMTP_FROM?.trim() ?? "";
const emailProviderUrl = process.env.EMAIL_PROVIDER_URL?.trim() ?? "";
const validHttpEmailProvider = emailProviderUrl.startsWith("https://");
const validSmtpProvider = Boolean(smtpHost && smtpFrom && Number.isInteger(smtpPort) && smtpPort >= 1 && smtpPort <= 65535);
if (serviceRole === "email-worker" && !validHttpEmailProvider && !validSmtpProvider) missing.push("email provider (HTTPS EMAIL_PROVIDER_URL or SMTP_HOST/SMTP_PORT/SMTP_FROM required)");
if (serviceRole === "email-worker" && process.env.SMTP_REQUIRE_TLS !== "true") missing.push("SMTP_REQUIRE_TLS=true");
if (serviceRole === "email-worker" && process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "true") missing.push("SMTP_TLS_REJECT_UNAUTHORIZED=true");
if (serviceRole === "email-worker" && !process.env.SMTP_TLS_CERT_FINGERPRINTS?.trim()) missing.push("SMTP_TLS_CERT_FINGERPRINTS");
const appUrl = process.env.APP_URL?.trim() ?? "";
let validAppUrl = false;
try {
  const url = new URL(appUrl);
  validAppUrl = url.protocol === "https:" &&
    !url.username && !url.password &&
    url.pathname === "/" && !url.search && !url.hash &&
    url.origin === `https://${url.host}`;
} catch {
  validAppUrl = false;
}
if (serviceRole !== "email-worker" && !validAppUrl) missing.push("APP_URL (canonical HTTPS origin required)");
if (process.env.NODE_ENV !== "production") throw new Error("NODE_ENV must be production");
if (missing.length || developmentValues.length) {
  const details = [missing.length ? `missing or short: ${missing.join(", ")}` : "", developmentValues.length ? `development values: ${developmentValues.join(", ")}` : ""].filter(Boolean).join("; ");
  throw new Error(`Production environment is unsafe (${details}).`);
}
console.log(`Production environment validated (${required.length} required secrets/config values).`);
