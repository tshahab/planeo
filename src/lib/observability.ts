import { randomUUID } from "node:crypto";

const sensitiveKey = /authorization|cookie|password|secret|token|credential|attachment|file|body/i;

export function redactLogValue(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redactLogValue(child, childKey)]));
  return value;
}

export function requestId(headers: Headers) {
  const supplied = headers.get("x-request-id");
  return supplied && /^[a-zA-Z0-9._-]{1,128}$/.test(supplied) ? supplied : randomUUID();
}

export function logEvent(level: "info" | "warn" | "error", event: string, metadata: Record<string, unknown> = {}) {
  const record = { timestamp: new Date().toISOString(), level, event, ...redactLogValue(metadata) as Record<string, unknown> };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else console.info(line);
}
