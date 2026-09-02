import { describe, expect, it } from "vitest";
import { parsePortalSchema, publicForm, validatePortalSubmission } from "../../src/lib/service-requests";

const schema = { fields: [
  { key: "summary", kind: "summary", label: "How can we help?", required: true, validation: { maxLength: 200 } },
  { key: "details", kind: "description", label: "Details", required: false },
  { key: "impact", kind: "custom", customFieldId: "impact-field", label: "Impact", required: true, options: ["low", "high"] },
  { key: "outage", kind: "custom", customFieldId: "outage-field", label: "Outage details", required: true, visibleWhen: { fieldKey: "impact", equals: "high" } },
] };

describe("customer-safe service request forms", () => {
  it("requires a summary and stable, unique customer field keys", () => {
    expect(parsePortalSchema(schema).fields).toHaveLength(4);
    expect(() => parsePortalSchema({ fields: [] })).toThrow(/summary/i);
    expect(() => parsePortalSchema({ fields: [{ key: "summary", kind: "summary", label: "One", required: true }, { key: "summary", kind: "description", label: "Two", required: false }] })).toThrow(/unique/i);
  });

  it("rejects hidden or agent-only injected values and validates conditions", () => {
    expect(() => validatePortalSubmission(schema, { summary: "Help", impact: "low", assigneeId: "agent-secret" })).toThrow(/not published/i);
    expect(validatePortalSubmission(schema, { summary: "Help", impact: "low" }).values).not.toHaveProperty("outage");
    expect(() => validatePortalSubmission(schema, { summary: "Help", impact: "high" })).toThrow(/Outage details is required/i);
  });

  it("validates attachment tokens and rejects unsafe regular expressions", () => {
    const withAttachment = { fields: [...schema.fields, { key: "files", kind: "attachment", label: "Files", required: true }] };
    expect(validatePortalSubmission(withAttachment, { summary: "Help", impact: "low", files: ["upload-1"] }).values.files).toEqual(["upload-1"]);
    expect(() => validatePortalSubmission(withAttachment, { summary: "Help", impact: "low", files: [1] })).toThrow(/invalid uploads/i);
    expect(() => parsePortalSchema({ fields: [{ key: "summary", kind: "summary", label: "Summary", required: true, validation: { pattern: "^(a+)+$" } }] })).toThrow(/unsafe/i);
  });

  it("publishes only the explicit schema and consent boundary", () => {
    const form = publicForm({ id: "v1", version: 1, name: "Help", description: null, icon: null, schema, consentText: "I agree" });
    expect(form).not.toHaveProperty("publishedById");
    expect(() => validatePortalSubmission(form.schema, { summary: "Help", impact: "low" }, form.consentText)).toThrow(/consent/i);
    expect(validatePortalSubmission(form.schema, { summary: "Help", impact: "low", consent: true }, form.consentText).values).not.toHaveProperty("consent");
  });
});
