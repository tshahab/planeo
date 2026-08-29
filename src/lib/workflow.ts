import type { Prisma, ProjectRole, WorkspaceRole } from "@prisma/client";

export type WorkflowRule = { type: string; [key: string]: unknown };
export type TransitionDraft = { fromStatusId: string; toStatusId: string; name?: string; description?: string; position?: number; enabled?: boolean; conditions?: WorkflowRule[]; validators?: WorkflowRule[]; actions?: WorkflowRule[] };

export async function validateWorkflowDraft(tx: Prisma.TransactionClient, projectId: string, transitions: TransitionDraft[]) {
  if (transitions.length > 200) throw new Error("A workflow may contain up to 200 transitions.");
  const ids = [...new Set(transitions.flatMap((item) => [item.fromStatusId, item.toStatusId]))];
  if (ids.some((id) => typeof id !== "string") || await tx.status.count({ where: { projectId, id: { in: ids } } }) !== ids.length) throw new Error("Every transition status must belong to this project.");
  const issueTypeIds = transitions.flatMap((item) => rules(item.conditions).filter((rule) => rule.type === "ISSUE_TYPE")).flatMap((rule) => strings(rule.issueTypeIds));
  if (await tx.issueType.count({ where: { projectId, id: { in: issueTypeIds } } }) !== new Set(issueTypeIds).size) throw new Error("A workflow condition references an invalid issue type.");
  const fieldIds = transitions.flatMap((item) => [...rules(item.conditions), ...rules(item.validators), ...rules(item.actions)]).flatMap((rule) => typeof rule.fieldId === "string" ? [rule.fieldId] : []);
  if (await tx.customFieldProject.count({ where: { projectId, fieldId: { in: fieldIds }, field: { archivedAt: null } } }) !== new Set(fieldIds).size) throw new Error("A workflow rule references an unavailable custom field.");
  for (const [index, item] of transitions.entries()) { if (item.fromStatusId === item.toStatusId) throw new Error("A transition must change status."); item.name = item.name?.trim() || "Transition"; if (item.name.length > 100) throw new Error("Each transition needs a name of 1–100 characters."); item.position = index; validateRules(item); }
  return transitions;
}

export async function evaluateTransition(tx: Prisma.TransactionClient, input: { projectId: string; issueId: string; fromStatusId: string; toStatusId: string; actorId: string; workspaceRole: WorkspaceRole; projectRole?: ProjectRole | null; proposed: Record<string, unknown> }) {
  const count = await tx.workflowTransition.count({ where: { projectId: input.projectId, enabled: true } }); if (!count) return null;
  const candidates = await tx.workflowTransition.findMany({ where: { projectId: input.projectId, fromStatusId: input.fromStatusId, toStatusId: input.toStatusId, enabled: true }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: input.issueId }, include: { customFieldValues: true } });
  const transition = candidates.find((item) => matches(rules(item.conditions), { ...input, issue })); if (!transition) throw new Error("No workflow transition is available for this issue and user.");
  const errors = rules(transition.validators).flatMap((rule) => validatorError(rule, issue, input.proposed)); if (errors.length) throw new Error(errors.join(" "));
  return { transition, actions: rules(transition.actions), issue };
}

function matches(conditions: WorkflowRule[], input: { actorId: string; workspaceRole: WorkspaceRole; projectRole?: ProjectRole | null; issue: { assigneeId: string | null; reporterId: string; issueTypeId: string; customFieldValues: Array<{ fieldId: string; value: unknown }> } }) { return conditions.every((rule) => rule.type === "ROLE" ? strings(rule.roles).includes(input.projectRole ?? input.workspaceRole) : rule.type === "ASSIGNEE" ? input.issue.assigneeId === input.actorId : rule.type === "REPORTER" ? input.issue.reporterId === input.actorId : rule.type === "ISSUE_TYPE" ? strings(rule.issueTypeIds).includes(input.issue.issueTypeId) : rule.type === "FIELD_EQUALS" ? input.issue.customFieldValues.some((value) => value.fieldId === rule.fieldId && JSON.stringify(value.value) === JSON.stringify(rule.value)) : false); }
function validatorError(rule: WorkflowRule, issue: { assigneeId: string | null; resolution: string | null; customFieldValues: Array<{ fieldId: string }> }, proposed: Record<string, unknown>) { if (rule.type === "RESOLUTION" && !(proposed.resolution || issue.resolution)) return ["A resolution is required for this transition."]; if (rule.type === "REQUIRED_FIELD") { const field = rule.field; const present = field === "assignee" ? proposed.assigneeId !== null && (proposed.assigneeId || issue.assigneeId) : typeof rule.fieldId === "string" ? issue.customFieldValues.some((value) => value.fieldId === rule.fieldId) : false; if (!present) return [`Required field ${String(rule.fieldId ?? field)} is missing.`]; } return []; }
function validateRules(item: TransitionDraft) { for (const rule of [...rules(item.conditions), ...rules(item.validators), ...rules(item.actions)]) if (typeof rule.type !== "string" || !rule.type) throw new Error("Every workflow rule needs a type."); }
function rules(value: unknown): WorkflowRule[] { return Array.isArray(value) ? value.filter((item): item is WorkflowRule => Boolean(item) && typeof item === "object" && typeof (item as WorkflowRule).type === "string") : []; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
