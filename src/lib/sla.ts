import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { QueueError } from "./service-queues";
import { validateConditions, validateRules, type Condition } from "../../ops/sla-engine.mjs";

export async function validateSlaGoal(tx: Prisma.TransactionClient, projectId: string, workspaceId: string, body: Record<string, unknown>, metric: string) {
  if (!["RESPONSE", "RESOLUTION"].includes(metric)) throw new QueueError("Metric must be RESPONSE or RESOLUTION.");
  if (!Number.isInteger(body.targetMinutes) || Number(body.targetMinutes) < 1 || Number(body.targetMinutes) > 525600 || !Number.isInteger(body.riskMinutes) || Number(body.riskMinutes) < 0 || Number(body.riskMinutes) >= Number(body.targetMinutes)) throw new QueueError("Set a target of 1–525600 business minutes and a smaller nonnegative risk window.");
  const calendarVersionId = typeof body.calendarVersionId === "string" ? body.calendarVersionId : "";
  if (!await tx.slaCalendarVersion.count({ where: { id: calendarVersionId, calendar: { projectId } } })) throw new QueueError("Select a calendar version in this project.");
  const conditions = validateConditions(body.conditions ?? []), rules = validateRules(body.rules, metric);
  const comparisons: Condition[] = [...conditions, ...rules.start, ...rules.resume, ...rules.stop, ...rules.reset, ...rules.success, ...rules.pause.flatMap(reason => reason.when)];
  for (const condition of comparisons) {
    const value = String(condition.equals);
    let valid = true;
    if (condition.field === "statusId") valid = Boolean(await tx.status.count({ where: { id: value, projectId } }));
    if (condition.field === "requestTypeId") valid = Boolean(await tx.serviceRequestType.count({ where: { id: value, projectId } }));
    if (condition.field === "organizationId") valid = Boolean(await tx.portalProjectOrganization.count({ where: { projectId, organizationId: value, organization: { workspaceId } } }));
    if (condition.field === "label") valid = Boolean(await tx.label.count({ where: { id: value, workspaceId, issues: { some: { issue: { projectId } } } } }));
    if (condition.field.startsWith("field:")) valid = Boolean(await tx.customFieldProject.count({ where: { projectId, fieldId: condition.field.slice(6), field: { workspaceId, archivedAt: null } } }));
    if (condition.field === "priority") valid = ["URGENT", "HIGH", "MEDIUM", "LOW"].includes(value);
    if (condition.field === "statusCategory") valid = ["TODO", "IN_PROGRESS", "DONE"].includes(value);
    if (condition.field === "event") valid = ["issue.created", "issue.updated", "issue.transitioned", "request.reopened", "customer.replied", "agent.replied", "sla.reset"].includes(value);
    if (!valid) throw new QueueError("A goal condition references an unavailable project value.");
  }
  const publicLabel = typeof body.publicLabel === "string" ? body.publicLabel.trim() : metric === "RESPONSE" ? "Response target" : "Resolution target";
  if (!publicLabel || publicLabel.length > 100 || body.portalVisible !== undefined && typeof body.portalVisible !== "boolean") throw new QueueError("Invalid customer-facing target label.");
  return { calendarVersionId, targetMinutes: Number(body.targetMinutes), riskMinutes: Number(body.riskMinutes), conditions: conditions as unknown as Prisma.InputJsonValue, rules: rules as unknown as Prisma.InputJsonValue, publicLabel, portalVisible: body.portalVisible === true };
}

export async function slaSummary(requestId: string, portal = false) {
  const cycles = await db.slaCycle.findMany({ where: { requestId }, orderBy: [{ metric: "asc" }, { sequence: "desc" }], take: 100, include: { goalVersion: { include: { goal: { select: { name: true } } } }, ...(portal ? {} : { events: { orderBy: { happenedAt: "asc" as const }, take: 100 } }) } });
  const latest = new Set<string>();
  return cycles.flatMap(cycle => {
    if (portal && latest.has(cycle.metric)) return []; latest.add(cycle.metric);
    if (portal && !cycle.goalVersion.portalVisible) return [];
    const remainingMinutes = Math.ceil(Math.max(0, cycle.goalVersion.targetMinutes * 60000 - Number(cycle.elapsedMs)) / 60000);
    const state = cycle.breachedAt ? "Overdue" : cycle.state === "PAUSED" ? "Waiting" : cycle.state === "MET" ? "Completed" : cycle.endedAt ? "Stopped" : "In progress";
    const safe = { label: cycle.goalVersion.publicLabel, state, remainingMinutes, updatedAt: cycle.lastAt };
    if (portal) return [safe];
    return [{ ...safe, id: cycle.id, name: cycle.goalVersion.goal.name, metric: cycle.metric, sequence: cycle.sequence, goalVersionId: cycle.goalVersionId, targetMinutes: cycle.goalVersion.targetMinutes, riskAt: cycle.riskAt, breachedAt: cycle.breachedAt, succeededAt: cycle.succeededAt, pauseReasons: cycle.pauseReasons, elapsedMs: String(cycle.elapsedMs), events: ("events" in cycle ? cycle.events : []).map(item => ({ ...item, elapsedMs: String(item.elapsedMs) })) }];
  });
}
