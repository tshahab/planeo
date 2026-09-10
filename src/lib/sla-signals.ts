import type { Prisma } from "@prisma/client";
import { matches, type Condition } from "../../ops/sla-engine.mjs";

export async function enqueueSlaSignal(tx: Prisma.TransactionClient, input: { issueId: string; event: string; eventKey: string; happenedAt?: Date }) {
  const request = await tx.serviceRequest.findUnique({ where: { issueId: input.issueId }, include: { issue: { include: { status: true, labels: { include: { label: true } }, customFieldValues: true } } } });
  if (!request) return;
  // Serialize signal timestamps with the worker clock so committed events never arrive
  // behind an already-accounted timer interval.
  await tx.$queryRaw`SELECT id FROM "ServiceRequest" WHERE id = ${request.id} FOR UPDATE`;
  const previous = await tx.slaSignal.findFirst({ where: { requestId: request.id }, orderBy: { id: "desc" }, select: { happenedAt: true, payload: true } });
  const prior = previous?.payload as Record<string, unknown> | undefined;
  const event = prior?.statusCategory === "DONE" && request.issue.status.category !== "DONE" ? "request.reopened" : input.event;
  const payload = { event, statusId: request.issue.statusId, statusCategory: request.issue.status.category, requestTypeId: request.requestTypeId, priority: request.issue.priority, organizationId: request.customerOrganizationId ?? "", labels: request.issue.labels.map(item => item.label.id), fields: Object.fromEntries(request.issue.customFieldValues.map(item => [item.fieldId, item.value])) };
  const goals = await tx.slaGoal.findMany({ where: { projectId: request.projectId, enabled: true }, orderBy: [{ position: "asc" }, { id: "asc" }], include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  const metrics = new Set<string>();
  const goalIds = goals.flatMap(goal => { const version = goal.versions[0]; if (!version || metrics.has(goal.metric) || !matches(version.conditions as Condition[], payload)) return []; metrics.add(goal.metric); return [version.id]; });
  if (!goalIds.length && !await tx.slaCycle.count({ where: { requestId: request.id } })) return;
  const current = await tx.serviceRequest.findUniqueOrThrow({ where: { id: request.id }, select: { slaCheckedAt: true } });
  const happenedAt = new Date(Math.max((input.happenedAt ?? new Date()).getTime(), previous?.happenedAt.getTime() ?? 0, current.slaCheckedAt?.getTime() ?? 0));
  await tx.slaSignal.createMany({ data: [{ requestId: request.id, eventKey: input.eventKey, happenedAt, payload, goalIds }], skipDuplicates: true });
}
