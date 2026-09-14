import { describe, expect, it } from "vitest";
import { sanitizeKnowledgeBody } from "@/lib/knowledge";
describe("knowledge content safety", () => {
  it("removes scripts, event handlers, javascript links, and iframes", () => {
    const safe = sanitizeKnowledgeBody(`<h2>Help</h2><a href="javascript:alert(1)" onclick="evil()">open</a><script>alert(1)</script><iframe src="https://evil.test"></iframe>`);
    expect(safe).not.toMatch(/script|iframe|javascript:|onclick/i);
    expect(safe).toContain("Help");
  });
  it("bounds stored content", () => expect(sanitizeKnowledgeBody("x".repeat(200_000))).toHaveLength(100_000));
});
