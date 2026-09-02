import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { accrue, matches } from "./sla-engine.mjs";

async function event(tx, request, cycle, type, at, suffix = type) {
  const eventKey = `${cycle.id}:${suffix}`;
  const inserted = await tx.slaEvent.createMany({ data: [{ cycleId: cycle.id, eventKey, type, happenedAt: at, elapsedMs: cycle.elapsedMs, metadata: { goalVersionId: cycle.goalVersionId } }], skipDuplicates: true });
  if (!inserted.count) return;
  await tx.auditEvent.create({ data: { workspaceId: request.workspaceId, action: type, targetType: "slaCycle", targetId: cycle.id, metadata: { requestId: request.id, eventKey, happenedAt: at.toISOString() } } });
  if (!["sla.risk", "sla.breached", "sla.succeeded"].includes(type)) return;
  const payload = { issueId: request.issueId, requestId: request.id, projectId: request.projectId, cycleId: cycle.id, goalVersionId: cycle.goalVersionId, event: type };
  const rules = await tx.automationRule.findMany({ where: { workspaceId: request.workspaceId, enabled: true, OR: [{ projectId: null }, { projectId: request.projectId }], trigger: { path: ["event"], equals: type } }, select: { id: true } });
  if (rules.length) await tx.automationJob.createMany({ data: rules.map(rule => ({ workspaceId: request.workspaceId, ruleId: rule.id, eventId: eventKey, event: type, payload, correlationId: eventKey, depth: 0 })), skipDuplicates: true });
  const subscriptions = await tx.webhookSubscription.findMany({ where: { workspaceId: request.workspaceId, enabled: true, events: { has: type }, OR: [{ projectId: null }, { projectId: request.projectId }] }, select: { id: true } });
  if (subscriptions.length) await tx.webhookDelivery.createMany({ data: subscriptions.map(subscription => ({ subscriptionId: subscription.id, eventId: eventKey, event: type, payload: { id: eventKey, type, apiVersion: "v1", createdAt: at.toISOString(), data: payload } })), skipDuplicates: true });
  const assigneeId = request.issue.assigneeId;
  if (assigneeId && await tx.workspaceMember.count({ where: { workspaceId: request.workspaceId, userId: assigneeId, deactivatedAt: null } })) await tx.notification.create({ data: { workspaceId: request.workspaceId, issueId: request.issueId, userId: assigneeId, type: "ISSUE_UPDATED", title: type === "sla.breached" ? "Service goal overdue" : type === "sla.risk" ? "Service goal approaching" : "Service goal completed", resourceUrl: `/projects/${request.project.key}?issue=${request.issueId}`, dedupeKey: `${eventKey}:${assigneeId}` } });
  if (cycle.goalVersion.portalVisible && request.customerReporterId) await tx.portalNotification.create({ data: { workspaceId: request.workspaceId, customerId: request.customerReporterId, requestId: request.id, type, message: type === "sla.breached" ? "Your service target is overdue. The team has been notified." : type === "sla.succeeded" ? "Your service target was completed." : "Your service target is approaching." } });
}

async function advance(tx, request, cycle, at) {
  const version = cycle.goalVersion;
  const result = accrue(version.calendarVersion.config, cycle, at, version.targetMinutes * 60000, version.riskMinutes * 60000);
  cycle.elapsedMs = BigInt(result.elapsedMs); cycle.lastAt = result.lastAt;
  for (const item of result.events) { if (item.type === "sla.risk") cycle.riskAt = item.at; if (item.type === "sla.breached") cycle.breachedAt = item.at; await event(tx, request, { ...cycle, elapsedMs: BigInt((item.type === "sla.risk" ? version.targetMinutes - version.riskMinutes : version.targetMinutes) * 60000) }, item.type, item.at); }
}
async function save(tx, cycle) { await tx.slaCycle.update({ where: { id: cycle.id }, data: { elapsedMs: cycle.elapsedMs, lastAt: cycle.lastAt, state: cycle.state, pauseReasons: cycle.pauseReasons, endedAt: cycle.endedAt, riskAt: cycle.riskAt, breachedAt: cycle.breachedAt, succeededAt: cycle.succeededAt } }); }

export async function processSlaRequest(db, requestId, now = new Date()) {
  return db.$transaction(async tx => {
    const locked = await tx.$queryRaw`SELECT id FROM "ServiceRequest" WHERE id = ${requestId} FOR UPDATE SKIP LOCKED`;
    if (!locked.length) return false;
    const request = await tx.serviceRequest.findUnique({ where: { id: requestId }, include: { issue: true, project: { select: { key: true } } } });
    if (!request || request.slaCheckedAt && request.slaCheckedAt > now) return false;
    const signals = await tx.slaSignal.findMany({ where: { requestId, processedAt: null, happenedAt: { lte: now } }, orderBy: { id: "asc" }, take: 100 });
    const cycles = await tx.slaCycle.findMany({ where: { requestId }, orderBy: { sequence: "desc" }, include: { goalVersion: { include: { calendarVersion: true } } } });
    const latest = new Map(); for (const cycle of cycles) if (!latest.has(cycle.metric)) latest.set(cycle.metric, cycle);
    for (const signal of signals) {
      const payload = signal.payload;
      for (const cycle of latest.values()) {
        if (cycle.endedAt) continue;
        await advance(tx, request, cycle, signal.happenedAt);
        const rules = cycle.goalVersion.rules;
        if (matches(rules.reset, payload)) { cycle.endedAt = signal.happenedAt; cycle.state = "RESET"; await event(tx, request, cycle, "sla.reset", signal.happenedAt, `reset:${signal.id}`); }
        else if (matches(rules.stop, payload)) {
          cycle.endedAt = signal.happenedAt; const succeeded = !cycle.breachedAt && matches(rules.success, payload);
          cycle.state = succeeded ? "MET" : "STOPPED"; cycle.succeededAt = succeeded ? signal.happenedAt : null;
          await event(tx, request, cycle, succeeded ? "sla.succeeded" : "sla.stopped", signal.happenedAt);
        } else {
          const reasons = rules.pause.filter(reason => matches(reason.when, payload)).map(reason => reason.id);
          const next = matches(rules.resume, payload) ? reasons : [...new Set([...cycle.pauseReasons, ...reasons])];
          if (JSON.stringify(next) !== JSON.stringify(cycle.pauseReasons)) { cycle.pauseReasons = next; cycle.state = next.length ? "PAUSED" : "RUNNING"; await event(tx, request, cycle, next.length ? "sla.paused" : "sla.resumed", signal.happenedAt, `pause:${signal.id}`); }
        }
        await save(tx, cycle);
      }
      const versions = await tx.slaGoalVersion.findMany({ where: { id: { in: signal.goalIds }, goal: { projectId: request.projectId } }, include: { goal: true, calendarVersion: true } });
      versions.sort((a, b) => signal.goalIds.indexOf(a.id) - signal.goalIds.indexOf(b.id));
      for (const version of versions) {
        const previous = latest.get(version.goal.metric), rules = version.rules;
        if (!matches(version.conditions, payload)) continue;
        if (previous && (!previous.endedAt || !matches(rules.reset, payload)) || !matches(rules.start, payload) || matches(rules.stop, payload)) continue;
        const pauseReasons = rules.pause.filter(reason => matches(reason.when, payload)).map(reason => reason.id);
        const created = await tx.slaCycle.create({ data: { requestId, goalVersionId: version.id, metric: version.goal.metric, sequence: (previous?.sequence ?? 0) + 1, startedAt: signal.happenedAt, lastAt: signal.happenedAt, pauseReasons, state: pauseReasons.length ? "PAUSED" : "RUNNING" } });
        const cycle = { ...created, goalVersion: version }; latest.set(cycle.metric, cycle); await event(tx, request, cycle, "sla.started", signal.happenedAt);
      }
      await tx.slaSignal.update({ where: { id: signal.id }, data: { processedAt: now } });
    }
    // Never tick past pending events when a backlog exceeds this bounded batch.
    const pending = await tx.slaSignal.findFirst({ where: { requestId, processedAt: null, happenedAt: { lte: now } }, orderBy: { id: "asc" } });
    const tickAt = pending ? signals.at(-1)?.happenedAt ?? request.slaCheckedAt ?? now : now;
    for (const cycle of latest.values()) if (!cycle.endedAt) { await advance(tx, request, cycle, tickAt); await save(tx, cycle); }
    const active = [...latest.values()];
    const state = active.some(cycle => cycle.breachedAt) ? "BREACHED" : active.some(cycle => !cycle.endedAt && cycle.riskAt) ? "AT_RISK" : active.some(cycle => !cycle.endedAt && cycle.state === "RUNNING") ? "RUNNING" : active.some(cycle => !cycle.endedAt) ? "PAUSED" : active.some(cycle => cycle.state === "MET") ? "MET" : "NONE";
    await tx.serviceRequest.update({ where: { id: requestId }, data: { slaState: state, slaCheckedAt: tickAt } });
    if (request.slaState !== state || signals.length) await tx.realtimeEvent.create({ data: { workspaceId: request.workspaceId, projectId: request.projectId, type: "issue.updated", resourceId: request.issueId, payload: { id: request.issueId, slaChanged: true } } });
    return true;
  }, { timeout: 30000 });
}

export async function processSlaBatch(db, now = new Date()) {
  const requests = await db.serviceRequest.findMany({ where: { project: { archivedAt: null }, issue: { archivedAt: null }, OR: [{ slaSignals: { some: { processedAt: null, happenedAt: { lte: now } } } }, { slaCycles: { some: { endedAt: null } }, OR: [{ slaCheckedAt: null }, { slaCheckedAt: { lt: new Date(now.getTime() - 30000) } }] }] }, orderBy: [{ slaCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 25, select: { id: true } });
  let processed = 0; for (const request of requests) if (await processSlaRequest(db, request.id, now)) processed++; return processed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }), once = process.argv.includes("--once");
  try { do { try { const processed = await processSlaBatch(db); console.log(JSON.stringify({ event: "sla.worker.batch", processed })); } catch (error) { console.error(JSON.stringify({ event: "sla.worker.failed", code: error?.code ?? "processing_failed" })); if (once) process.exitCode = 1; } if (!once) await new Promise(resolve => setTimeout(resolve, 5000)); } while (!once); } finally { await db.$disconnect(); }
}
