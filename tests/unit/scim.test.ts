import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createScimSecret, parseScimFilter, scimPage } from "@/lib/scim";

describe("SCIM protocol helpers", () => {
  it("creates one-time credentials whose stored value is only a hash", () => {
    const token = createScimSecret();
    expect(token.secret).toMatch(/^scim_[a-f0-9]{12}\.[A-Za-z0-9_-]+$/);
    expect(token.secretHash).not.toContain(token.secret);
    expect(token.secretHash).toBe(createHash("sha256").update(token.secret).digest("hex"));
  });
  it("accepts only bounded equality filters", () => {
    expect(parseScimFilter('userName eq "user@example.com"', ["userName"])).toEqual({ attribute: "userName", value: "user@example.com" });
    expect(() => parseScimFilter('userName co "example"', ["userName"])).toThrow("invalidFilter");
    expect(() => parseScimFilter('password eq "secret"', ["userName"])).toThrow("invalidFilter");
  });
  it("bounds pagination", () => {
    expect(scimPage("https://example.test?startIndex=-5&count=10000")).toEqual({ startIndex: 1, count: 100, skip: 0 });
  });
});
