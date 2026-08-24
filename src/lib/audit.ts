const sensitiveKey = /(password|credential|secret|token|cookie|authorization|content|body)/i;
export function redactAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? "[REDACTED]" : redactAuditMetadata(item)]));
}
