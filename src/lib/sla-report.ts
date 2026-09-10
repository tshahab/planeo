import type { AuthContext } from "./auth";
import { db } from "./db";
import { issueSecurityWhere } from "./permissions";
import { queueProject, QueueError } from "./service-queues";
export async function slaReport(context: AuthContext, key: string, days = 90) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new QueueError("Select 1–365 report days.");
  const project = await queueProject(context, key);
  const cycles = await db.slaCycle.findMany({ where: { startedAt: { gte: new Date(Date.now() - days * 86400000) }, request: { workspaceId: context.workspace.id, projectId: project.id, issue: { archivedAt: null, AND: [await issueSecurityWhere(context, [project.id])] } } }, take: 10001, select: { state: true, breachedAt: true, metric: true, goalVersion: { select: { version: true, goal: { select: { name: true } } } } } });
  if (cycles.length > 10000) throw new QueueError("Narrow this report to fewer days (maximum 10,000 cycles).");
  const groups = new Map<string, { goal: string; version: number; metric: string; cycles: number; met: number; breached: number; active: number }>();
  for (const cycle of cycles) { const key = `${cycle.goalVersion.goal.name}:${cycle.goalVersion.version}`; const row = groups.get(key) ?? { goal: cycle.goalVersion.goal.name, version: cycle.goalVersion.version, metric: cycle.metric, cycles: 0, met: 0, breached: 0, active: 0 }; row.cycles++; if (cycle.state === "MET") row.met++; if (cycle.breachedAt) row.breached++; if (["RUNNING", "PAUSED"].includes(cycle.state)) row.active++; groups.set(key, row); }
  return { project: { key: project.key, name: project.name }, days, rows: [...groups.values()] };
}
