import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("worker encryption secret configuration", () => {
  it("requires the dedicated webhook secret without a session-secret fallback", () => {
    for (const file of ["ops/webhook-worker.mjs", "ops/chat-worker.mjs"]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toContain("process.env.SESSION_SECRET");
      expect(source).toContain("process.env.WEBHOOK_ENCRYPTION_SECRET");
    }
  });
});
