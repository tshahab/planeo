import { describe, expect, it } from "vitest";
import { absoluteAppUrl, emailTemplate } from "../../src/lib/email";

describe("transactional email", () => {
  it("renders accessible multipart content and escapes untrusted values", () => {
    const email = emailTemplate({ heading: "Assigned <issue>", message: "A & B", actionLabel: "View", actionUrl: "https://planeo.test/issues/1" });
    expect(email.textBody).toContain("Assigned <issue>");
    expect(email.htmlBody).toContain("<html lang=\"en\">");
    expect(email.htmlBody).toContain("Assigned &lt;issue&gt;");
    expect(email.htmlBody).not.toContain("A & B");
  });
  it("builds links from the configured public origin", () => {
    const previous = process.env.APP_URL; process.env.APP_URL = "https://planeo.test/";
    expect(absoluteAppUrl("/reset-password")).toBe("https://planeo.test/reset-password");
    process.env.APP_URL = previous;
  });
});
