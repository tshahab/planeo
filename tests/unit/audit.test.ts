import { describe, expect, it } from "vitest";
import { redactAuditMetadata } from "@/lib/audit";
describe("audit redaction", () => { it("redacts sensitive keys recursively without mutating safe metadata", () => { expect(redactAuditMetadata({ projectId: "p1", password: "bad", nested: { resetToken: "secret", role: "ADMIN" }, items: [{ cookie: "x", key: "ok" }] })).toEqual({ projectId: "p1", password: "[REDACTED]", nested: { resetToken: "[REDACTED]", role: "ADMIN" }, items: [{ cookie: "[REDACTED]", key: "ok" }] }); }); });
