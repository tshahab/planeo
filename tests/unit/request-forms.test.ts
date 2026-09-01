import { describe, expect, it } from "vitest";
import { validateRequestFormSchema, validateRequestSubmission } from "@/lib/request-forms";

const tx = { customFieldProject: { findMany: async () => [{ fieldId: "custom-1", field: { archivedAt: null } }] } };

describe("customer request forms", () => {
  it("requires explicit customer visibility and hides conditional values server-side", async () => {
    await expect(validateRequestFormSchema(tx as never, "project", { fields: [{ key: "summary", label: "Subject", required: true }] })).rejects.toThrow(/explicitly customer-visible/i);
    const schema = await validateRequestFormSchema(tx as never, "project", { fields: [
      { key: "summary", label: "Subject", required: true, customerVisible: true, validation: { minLength: 3 } },
      { key: "details", customFieldId: "custom-1", label: "Details", required: true, customerVisible: true, visibleWhen: { field: "summary", equals: "show" } },
    ] });
    expect(validateRequestSubmission(schema, { summary: "ordinary", details: "must be discarded", agentOnly: "secret" })).toEqual({ summary: "ordinary" });
    expect(() => validateRequestSubmission(schema, { summary: "show" })).toThrow(/Details is required/);
  });

  it("enforces consent and draft-safe validation", async () => {
    const schema = await validateRequestFormSchema(tx as never, "project", { consentText: "I agree", fields: [{ key: "summary", label: "Subject", required: true, customerVisible: true, validation: { pattern: "^[A-Z]" } }] });
    expect(() => validateRequestSubmission(schema, { summary: "lower", consent: true })).toThrow(/invalid format/);
    expect(() => validateRequestSubmission(schema, { summary: "Valid" })).toThrow(/Consent/);
    expect(validateRequestSubmission(schema, { summary: "Valid", consent: true })).toEqual({ summary: "Valid" });
  });
});
