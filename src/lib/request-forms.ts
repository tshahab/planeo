import type { Prisma } from "@prisma/client";

export type RequestFormField = {
  key: string;
  customFieldId?: string;
  label: string;
  helpText?: string;
  required?: boolean;
  customerVisible: true;
  defaultValue?: unknown;
  validation?: { minLength?: number; maxLength?: number; pattern?: string };
  visibleWhen?: { field: string; equals: unknown };
};
export type RequestFormSchema = { fields: RequestFormField[]; consentText?: string };
const STANDARD_FIELDS = new Set(["summary", "description", "priority", "attachments"]);

export async function validateRequestFormSchema(tx: Prisma.TransactionClient, projectId: string, value: unknown): Promise<RequestFormSchema> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A form schema is required.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.fields) || input.fields.length === 0 || input.fields.length > 50) throw new Error("A form needs between 1 and 50 fields.");
  const configured = await tx.customFieldProject.findMany({ where: { projectId, field: { archivedAt: null } }, include: { field: true } });
  const customIds = new Set(configured.map(item => item.fieldId));
  const keys = new Set<string>();
  const fields = input.fields.map((raw, position) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Field ${position + 1} is invalid.`);
    const item = raw as Record<string, unknown>;
    const key = typeof item.key === "string" ? item.key.trim() : "";
    const customFieldId = typeof item.customFieldId === "string" ? item.customFieldId : undefined;
    if (!key || keys.has(key)) throw new Error("Form field keys must be non-empty and unique.");
    keys.add(key);
    if (!STANDARD_FIELDS.has(key) && (!customFieldId || !customIds.has(customFieldId))) throw new Error(`Field ${key} is not customer-configurable for this project.`);
    if (item.customerVisible !== true) throw new Error(`Field ${key} must be explicitly customer-visible.`);
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label || label.length > 120) throw new Error(`Field ${key} needs a customer label.`);
    const validation = item.validation && typeof item.validation === "object" && !Array.isArray(item.validation) ? item.validation as RequestFormField["validation"] : undefined;
    if (validation?.pattern) { try { new RegExp(validation.pattern); } catch { throw new Error(`Field ${key} has an invalid validation pattern.`); } }
    const visibleWhen = item.visibleWhen && typeof item.visibleWhen === "object" && !Array.isArray(item.visibleWhen) ? item.visibleWhen as RequestFormField["visibleWhen"] : undefined;
    return { key, ...(customFieldId ? { customFieldId } : {}), label, ...(typeof item.helpText === "string" ? { helpText: item.helpText.slice(0, 500) } : {}), ...(item.required === true ? { required: true } : {}), customerVisible: true as const, ...(item.defaultValue !== undefined ? { defaultValue: item.defaultValue } : {}), ...(validation ? { validation } : {}), ...(visibleWhen ? { visibleWhen } : {}) };
  });
  for (const field of fields) if (field.visibleWhen && !keys.has(field.visibleWhen.field)) throw new Error(`Field ${field.key} depends on an unknown field.`);
  if (!fields.some(field => field.key === "summary" && field.required)) throw new Error("The customer form must include a required summary field.");
  const consentText = typeof input.consentText === "string" ? input.consentText.trim().slice(0, 2000) : undefined;
  return { fields, ...(consentText ? { consentText } : {}) };
}

export function validateRequestSubmission(schema: RequestFormSchema, raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Form values are required.");
  const supplied = raw as Record<string, unknown>, values: Record<string, unknown> = {};
  for (const field of schema.fields) {
    const visible = !field.visibleWhen || supplied[field.visibleWhen.field] === field.visibleWhen.equals;
    if (!visible) continue;
    const value = supplied[field.key] ?? field.defaultValue;
    const missing = value === undefined || value === null || value === "" || Array.isArray(value) && value.length === 0;
    if (field.required && missing) throw new Error(`${field.label} is required.`);
    if (missing) continue;
    if (typeof value === "string") {
      if (field.validation?.minLength !== undefined && value.length < field.validation.minLength) throw new Error(`${field.label} is too short.`);
      if (field.validation?.maxLength !== undefined && value.length > field.validation.maxLength) throw new Error(`${field.label} is too long.`);
      if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) throw new Error(`${field.label} has an invalid format.`);
    }
    values[field.key] = value;
  }
  if (schema.consentText && supplied.consent !== true) throw new Error("Consent is required.");
  return values;
}
