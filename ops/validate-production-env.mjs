const required = ["DATABASE_URL", "SESSION_SECRET", "ATTACHMENT_SIGNING_SECRET", "AUDIT_EXPORT_KEY"];
const forbidden = new Set([
  "docker-development-secret-change-before-production",
  "planeo-demo",
  "planeo-demo-password",
]);

const missing = required.filter((name) => !process.env[name] || process.env[name].length < 32);
const developmentValues = required.filter((name) => forbidden.has(process.env[name]));
const database = process.env.DATABASE_URL ?? "";
if (database && !/^postgres(?:ql)?:\/\//.test(database)) missing.push("DATABASE_URL (PostgreSQL URL required)");
if (!/^https:\/\//.test(process.env.APP_URL ?? "")) missing.push("APP_URL (HTTPS origin required)");
if (process.env.NODE_ENV !== "production") throw new Error("NODE_ENV must be production");
if (missing.length || developmentValues.length) {
  const details = [missing.length ? `missing or short: ${missing.join(", ")}` : "", developmentValues.length ? `development values: ${developmentValues.join(", ")}` : ""].filter(Boolean).join("; ");
  throw new Error(`Production environment is unsafe (${details}).`);
}
console.log(`Production environment validated (${required.length} required secrets/config values).`);
