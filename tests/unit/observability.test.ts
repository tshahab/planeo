import { describe, expect, it, vi } from "vitest";
import { logEvent, redactLogValue, requestId } from "@/lib/observability";

describe("structured logging", () => {
  it("recursively redacts credentials, cookies, tokens, and attachment data", () => {
    expect(redactLogValue({ requestId: "req-1", cookie: "session", nested: { token: "secret", attachmentBody: "bytes", safe: "ok" } })).toEqual({ requestId: "req-1", cookie: "[REDACTED]", nested: { token: "[REDACTED]", attachmentBody: "[REDACTED]", safe: "ok" } });
  });

  it("emits machine-readable JSON and preserves a valid request id", () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(requestId(new Headers({ "x-request-id": "pilot-123" }))).toBe("pilot-123");
    logEvent("info", "request.completed", { workspaceId: "workspace-1", password: "never-log" });
    expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({ level: "info", event: "request.completed", workspaceId: "workspace-1", password: "[REDACTED]" });
    output.mockRestore();
  });
});
