import type { Prisma } from "@prisma/client";

export const PORTAL_FIELD_KINDS = ["summary", "description", "priority", "custom", "attachment"] as const;
export type PortalField = {
  key: string;
  kind: typeof PORTAL_FIELD_KINDS[number];
  customFieldId?: string;
  label: string;
  helpText?: string;
  required: boolean;
  defaultValue?: unknown;
  options?: string[];
  validation?: { minLength?: number; maxLength?: number; pattern?: string };
  visibleWhen?: { fieldKey: string; equals: string | boolean | number };
};
export type PortalSchema = { fields: PortalField[] };

export function parsePortalSchema(value: unknown, options: { allowIncomplete?: boolean } = {}): PortalSchema {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Form schema must be an object.");
  const fields = (value as { fields?: unknown }).fields;
  if (!Array.isArray(fields) || fields.length > 50) throw new Error("Form schema must contain at most 50 fields.");
  const parsed = fields.map((raw, position) => parseField(raw, position));
  const keys = new Set(parsed.map(({ key }) => key));
  if (keys.size !== parsed.length) throw new Error("Form field keys must be unique.");
  for (const field of parsed) if (field.visibleWhen && !keys.has(field.visibleWhen.fieldKey)) throw new Error(`Conditional field ${field.key} references an unknown field.`);
  if (!options.allowIncomplete && !parsed.some(({ kind }) => kind === "summary")) throw new Error("Published forms require a summary field.");
  if (parsed.filter(({ kind }) => kind === "summary").length > 1 || parsed.filter(({ kind }) => kind === "description").length > 1 || parsed.filter(({ kind }) => kind === "priority").length > 1) throw new Error("Standard fields can appear only once.");
  return { fields: parsed };
}

function parseField(value: unknown, position: number): PortalField {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Form field ${position + 1} is invalid.`);
  const input = value as Record<string, unknown>;
  const kind = PORTAL_FIELD_KINDS.find((candidate) => candidate === input.kind);
  const key = typeof input.key === "string" ? input.key.trim() : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!kind || !/^[a-z][a-zA-Z0-9_-]{0,63}$/.test(key) || !label || label.length > 100) throw new Error(`Form field ${position + 1} has an invalid kind, key, or label.`);
  const customFieldId = kind === "custom" && typeof input.customFieldId === "string" ? input.customFieldId : undefined;
  if (kind === "custom" && !customFieldId) throw new Error(`Custom form field ${key} requires a stable field ID.`);
  const helpText = typeof input.helpText === "string" ? input.helpText.trim().slice(0, 500) : undefined;
  const options = Array.isArray(input.options) && input.options.length <= 100 && input.options.every((item) => typeof item === "string" && item.trim() && item.length <= 100) ? input.options as string[] : undefined;
  if (input.options !== undefined && (!options || new Set(options).size !== options.length)) throw new Error(`Form field ${key} has invalid or duplicate options.`);
  const validationInput = input.validation && typeof input.validation === "object" && !Array.isArray(input.validation) ? input.validation as Record<string, unknown> : undefined;
  if (validationInput && Object.keys(validationInput).some((candidate) => !["minLength", "maxLength", "pattern"].includes(candidate))) throw new Error(`Form field ${key} has an unknown validation rule.`);
  const minLength = validationInput?.minLength; const maxLength = validationInput?.maxLength; const pattern = validationInput?.pattern;
  if (minLength !== undefined && (!Number.isInteger(minLength) || (minLength as number) < 0 || (minLength as number) > 10_000) || maxLength !== undefined && (!Number.isInteger(maxLength) || (maxLength as number) < 1 || (maxLength as number) > 10_000) || typeof minLength === "number" && typeof maxLength === "number" && minLength > maxLength) throw new Error(`Form field ${key} has invalid length validation.`);
  if (pattern !== undefined && (typeof pattern !== "string" || pattern.length > 200 || /[()|]|\\[1-9]/.test(pattern))) throw new Error(`Form field ${key} has an unsafe validation pattern.`);
  if (typeof pattern === "string") try { new RegExp(pattern); } catch { throw new Error(`Form field ${key} has an invalid validation pattern.`); }
  const validation = validationInput ? { ...(typeof minLength === "number" ? { minLength } : {}), ...(typeof maxLength === "number" ? { maxLength } : {}), ...(typeof pattern === "string" ? { pattern } : {}) } : undefined;
  const condition = input.visibleWhen && typeof input.visibleWhen === "object" && !Array.isArray(input.visibleWhen) ? input.visibleWhen as Record<string, unknown> : undefined;
  if (condition && (typeof condition.fieldKey !== "string" || !["string", "boolean", "number"].includes(typeof condition.equals))) throw new Error(`Form field ${key} has an invalid visibility condition.`);
  const visibleWhen = condition ? { fieldKey: condition.fieldKey as string, equals: condition.equals as string | boolean | number } : undefined;
  return { key, kind, customFieldId, label, helpText, required: input.required === true, defaultValue: input.defaultValue, options, validation, visibleWhen };
}

export function publicForm(version: { id: string; version: number; name: string; description: string | null; icon: string | null; schema: Prisma.JsonValue; consentText: string | null }) {
  return { id: version.id, version: version.version, name: version.name, description: version.description, icon: version.icon, schema: parsePortalSchema(version.schema), consentText: version.consentText };
}

export function validatePortalSubmission(schemaValue: unknown, valuesValue: unknown, consentText?: string | null) {
  const schema = parsePortalSchema(schemaValue);
  if (!valuesValue || typeof valuesValue !== "object" || Array.isArray(valuesValue)) throw new Error("Submission values must be an object.");
  const supplied = valuesValue as Record<string, unknown>;
  const allowed = new Set(schema.fields.map(({ key }) => key));
  if (consentText) allowed.add("consent");
  if (Object.keys(supplied).some((key) => !allowed.has(key))) throw new Error("Submission contains a field that is not published for customers.");
  const normalized: Record<string, unknown> = {};
  for (const field of schema.fields) {
    const visible = !field.visibleWhen || supplied[field.visibleWhen.fieldKey] === field.visibleWhen.equals;
    if (!visible) continue;
    const value = supplied[field.key] ?? field.defaultValue;
    const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (empty && field.required) throw new Error(`${field.label} is required.`);
    if (empty) continue;
    if (field.kind === "attachment") {
      if (!Array.isArray(value) || value.length > 10 || value.some((item) => typeof item !== "string")) throw new Error(`${field.label} contains invalid uploads.`);
      normalized[field.key] = value;
      continue;
    }
    if (typeof value === "string") {
      if (field.validation?.minLength !== undefined && value.length < field.validation.minLength) throw new Error(`${field.label} is too short.`);
      if (field.validation?.maxLength !== undefined && value.length > field.validation.maxLength) throw new Error(`${field.label} is too long.`);
      if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) throw new Error(`${field.label} has an invalid value.`);
    }
    if (field.options && (typeof value !== "string" || !field.options.includes(value))) throw new Error(`${field.label} has an invalid option.`);
    normalized[field.key] = value;
  }
  if (consentText && supplied.consent !== true) throw new Error("Consent is required.");
  return { schema, values: normalized };
}

export async function assertPortalSchemaReferences(tx: Prisma.TransactionClient, workspaceId: string, projectId: string, schemaValue: unknown) {
  const schema = parsePortalSchema(schemaValue, { allowIncomplete: true });
  const ids = schema.fields.flatMap((field) => field.customFieldId ? [field.customFieldId] : []);
  if (!ids.length) return schema;
  const configured = await tx.customFieldProject.findMany({ where: { projectId, fieldId: { in: ids }, field: { workspaceId, archivedAt: null } }, select: { fieldId: true } });
  const available = new Set(configured.map(({ fieldId }) => fieldId));
  if (ids.some((id) => !available.has(id))) throw new Error("Form references a custom field that is not active in this project.");
  return schema;
}
