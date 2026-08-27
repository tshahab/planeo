import { describe, expect, it } from "vitest";
import { attachmentDownloadUrl, verifyAttachmentSignature } from "@/lib/storage";

describe("attachment download signatures", () => {
  it("binds short-lived signatures to the workspace and attachment", () => {
    process.env.ATTACHMENT_SIGNING_SECRET = "test-attachment-signing-secret-at-least-32-characters";
    const url = new URL(attachmentDownloadUrl("workspace-one", "attachment-one"), "http://planeo.test");
    const expires = Number(url.searchParams.get("expires"));
    const signature = url.searchParams.get("signature") ?? "";
    expect(verifyAttachmentSignature("workspace-one", "attachment-one", expires, signature)).toBe(true);
    expect(verifyAttachmentSignature("workspace-two", "attachment-one", expires, signature)).toBe(false);
    expect(verifyAttachmentSignature("workspace-one", "attachment-two", expires, signature)).toBe(false);
  });
});
