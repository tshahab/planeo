import type { CustomFieldType, Prisma } from "@prisma/client";

export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "SINGLE_SELECT", "MULTI_SELECT", "USER", "URL"] as const;

type FieldConfiguration = {
  field: { id: string; workspaceId: string; type: CustomFieldType; options: Prisma.JsonValue; defaultValue: Prisma.JsonValue; archivedAt: Date | null };
  required: boolean;
  issueTypeIds: Prisma.JsonValue;
};

export function configuredForIssueType(configuration: FieldConfiguration, issueTypeId: string) {
  const ids = Array.isArray(configuration.issueTypeIds) ? configuration.issueTypeIds.filter((value): value is string => typeof value === "string") : [];
  return ids.length === 0 || ids.includes(issueTypeId);
}

export async function validateCustomFieldWrites(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; projectId: string; issueTypeId: string; values: unknown; partial?: boolean },
) {
  if (input.values !== undefined && (input.values === null || typeof input.values !== "object" || Array.isArray(input.values))) throw new Error("Custom fields must be an object keyed by stable field ID.");
  const supplied = (input.values ?? {}) as Record<string, unknown>;
  const configurations = await tx.customFieldProject.findMany({
    where: { projectId: input.projectId, field: { workspaceId: input.workspaceId } },
    include: { field: true }, orderBy: { position: "asc" },
  });
  const applicable = configurations.filter((configuration) => configuredForIssueType(configuration, input.issueTypeId));
  const known = new Map(applicable.map((configuration) => [configuration.field.id, configuration]));
  for (const id of Object.keys(supplied)) {
    const configuration = known.get(id);
    if (!configuration) throw new Error(`Custom field ${id} is not configured for this project and issue type.`);
    if (configuration.field.archivedAt) throw new Error(`Archived custom field ${id} cannot receive new values.`);
  }
  const normalized = new Map<string, Prisma.InputJsonValue>();
  for (const configuration of applicable) {
    const raw = Object.prototype.hasOwnProperty.call(supplied, configuration.field.id) ? supplied[configuration.field.id] : configuration.field.defaultValue;
    if (raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0)) {
      if (!input.partial && configuration.required) throw new Error(`Custom field ${configuration.field.id} is required.`);
      continue;
    }
    normalized.set(configuration.field.id, await normalizeValue(tx, configuration.field, raw, input));
  }
  return normalized;
}

async function normalizeValue(tx: Prisma.TransactionClient, field: FieldConfiguration["field"], value: unknown, scope: { workspaceId: string; projectId: string }) {
  const options = Array.isArray(field.options) ? field.options.filter((item): item is string => typeof item === "string") : [];
  switch (field.type) {
    case "TEXT": if (typeof value !== "string" || value.length > 10_000) break; return value;
    case "NUMBER": if (typeof value !== "number" || !Number.isFinite(value)) break; return value;
    case "BOOLEAN": if (typeof value !== "boolean") break; return value;
    case "DATE": if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) break; return value;
    case "URL": if (typeof value !== "string" || value.length > 2048) break; try { const url = new URL(value); if (url.protocol !== "http:" && url.protocol !== "https:") break; return url.toString(); } catch { break; }
    case "SINGLE_SELECT": if (typeof value !== "string" || !options.includes(value)) break; return value;
    case "MULTI_SELECT": if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !options.includes(item)) || new Set(value).size !== value.length) break; return value as string[];
    case "USER": {
      if (typeof value !== "string") break;
      const member = await tx.workspaceMember.findFirst({ where: { workspaceId: scope.workspaceId, userId: value, deactivatedAt: null, user: { OR: [{ projectRoles: { some: { projectId: scope.projectId } } }, { memberships: { some: { workspaceId: scope.workspaceId, role: { in: ["OWNER", "ADMIN"] } } } }] } }, select: { userId: true } });
      if (!member) break; return value;
    }
  }
  throw new Error(`Value for custom field ${field.id} does not match ${field.type}.`);
}

export function validateFieldDefinition(input: Record<string, unknown>) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : null;
  const type = typeof input.type === "string" && CUSTOM_FIELD_TYPES.includes(input.type as typeof CUSTOM_FIELD_TYPES[number]) ? input.type as CustomFieldType : null;
  if (!name || name.length > 100) throw new Error("Field name must contain 1–100 characters.");
  if (description && description.length > 500) throw new Error("Field description cannot exceed 500 characters.");
  if (!type) throw new Error("Custom field type is invalid.");
  const options = input.options === undefined ? [] : input.options;
  if (!Array.isArray(options) || options.some((value) => typeof value !== "string" || !value.trim() || value.length > 100) || new Set(options).size !== options.length || options.length > 100) throw new Error("Options must be up to 100 unique non-empty strings.");
  if (!["SINGLE_SELECT", "MULTI_SELECT"].includes(type) && options.length) throw new Error("Only select fields may define options.");
  return { name, description, type, options };
}
