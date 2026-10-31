import { describe, expect, it } from "vitest";
import { requestClientKey } from "@/lib/security";

describe("request client identity", () => {
  it("prefers the ingress-provided canonical client address", () => {
    const request = new Request("https://plan-uat.teknosys.ai/api/auth/login", {
      headers: {
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.20, 203.0.113.10",
      },
    });
    expect(requestClientKey(request)).toBe("203.0.113.10");
  });

  it("uses the left-most forwarded address when the ingress canonical header is absent", () => {
    const request = new Request("https://plan-uat.teknosys.ai/api/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.20, 203.0.113.10" },
    });
    expect(requestClientKey(request)).toBe("198.51.100.20");
  });
});
