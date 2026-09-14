export const DEPENDENCY_TYPES = ["blocks", "relates", "duplicates"] as const;
export type DependencyType = typeof DEPENDENCY_TYPES[number];
export type DependencyNode = { id: string; key: string; summary: string; projectId: string; projectName: string; dueDate: Date | null; estimate: number | null; completed: boolean };
export type DependencyEdge = { id: string; fromId: string; toId: string; type: string; lagDays: number; version: number };
export type DependencyWarning = { code: "CYCLE" | "MISSING_DATE" | "IMPOSSIBLE_ORDER" | "BLOCKED_MILESTONE" | "CROSS_PROJECT_CONFLICT"; issueIds: string[]; message: string };

const DAY = 86_400_000;
export function analyzeDependencies(nodes: DependencyNode[], edges: DependencyEdge[]) {
  const byId = new Map(nodes.map(node => [node.id, node])), visible = new Set(byId.keys());
  const dependencies = edges.filter(edge => edge.type === "blocks" && visible.has(edge.fromId) && visible.has(edge.toId));
  const outgoing = new Map<string, DependencyEdge[]>(), incoming = new Map<string, DependencyEdge[]>();
  for (const edge of dependencies) { outgoing.set(edge.fromId, [...(outgoing.get(edge.fromId) ?? []), edge]); incoming.set(edge.toId, [...(incoming.get(edge.toId) ?? []), edge]); }
  const warnings: DependencyWarning[] = [], visiting = new Set<string>(), visited = new Set<string>(), cyclic = new Set<string>(), order: string[] = [];
  function visit(id: string, trail: string[]) { if (visiting.has(id)) { const start = trail.indexOf(id); for (const value of trail.slice(start)) cyclic.add(value); return; } if (visited.has(id)) return; visiting.add(id); for (const edge of outgoing.get(id) ?? []) visit(edge.toId, [...trail, edge.toId]); visiting.delete(id); visited.add(id); order.push(id); }
  for (const node of nodes) visit(node.id, [node.id]);
  if (cyclic.size) warnings.push({ code: "CYCLE", issueIds: [...cyclic].sort(), message: "Dependency cycle requires correction before dates can be trusted." });
  for (const edge of dependencies) { const from = byId.get(edge.fromId)!, to = byId.get(edge.toId)!;
    if (!from.dueDate || !to.dueDate) warnings.push({ code: "MISSING_DATE", issueIds: [from.id, to.id], message: `${from.key} → ${to.key} has a partial schedule.` });
    else { const earliest = from.dueDate.getTime() + edge.lagDays * DAY; if (to.dueDate.getTime() < earliest) warnings.push({ code: from.projectId === to.projectId ? "IMPOSSIBLE_ORDER" : "CROSS_PROJECT_CONFLICT", issueIds: [from.id, to.id], message: `${to.key} is scheduled before ${from.key} and its ${edge.lagDays}-day lag.` }); }
    if (!from.completed && to.completed) warnings.push({ code: "BLOCKED_MILESTONE", issueIds: [from.id, to.id], message: `${to.key} is complete while blocker ${from.key} remains open.` });
  }
  const duration = (node: DependencyNode) => Math.max(1, node.estimate ?? 1), distance = new Map<string, number>(), predecessor = new Map<string, string>();
  for (const id of order.reverse()) { let best = duration(byId.get(id)!); for (const edge of incoming.get(id) ?? []) { const candidate = (distance.get(edge.fromId) ?? duration(byId.get(edge.fromId)!)) + edge.lagDays + duration(byId.get(id)!); if (candidate > best) { best = candidate; predecessor.set(id, edge.fromId); } } distance.set(id, best); }
  let cursor: string | undefined = [...distance.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]))[0]?.[0]; const criticalPath: string[] = [];
  while (cursor && !criticalPath.includes(cursor)) { criticalPath.unshift(cursor); cursor = predecessor.get(cursor); }
  const atRisk = new Set(warnings.flatMap(warning => warning.issueIds));
  return { assumptions: { timezone: "UTC", estimateUnit: "calendar_day", missingEstimateDays: 1, hiddenDependencies: "omitted_without_identifying_detail" }, nodes: nodes.map(node => ({ ...node, dueDate: node.dueDate?.toISOString().slice(0,10) ?? null, critical: criticalPath.includes(node.id), atRisk: atRisk.has(node.id) })), edges: dependencies, warnings, criticalPath, durationDays: criticalPath.length ? Math.max(...criticalPath.map(id => distance.get(id) ?? 0)) : 0 };
}

export function validateDependencyInput(value: unknown) { const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {}; const type = DEPENDENCY_TYPES.find(item => item === input.type); const lagDays = input.lagDays === undefined ? 0 : Number(input.lagDays); if (!type || !Number.isInteger(lagDays) || lagDays < -365 || lagDays > 365) throw new Error("Use a supported link type and a lag from -365 to 365 days."); return { type, lagDays }; }

export function introducesCycle(edges: Array<{ fromId: string; toId: string }>, fromId: string, toId: string) { if (fromId === toId) return true; const outgoing = new Map<string,string[]>(); for (const edge of edges) outgoing.set(edge.fromId, [...(outgoing.get(edge.fromId) ?? []), edge.toId]); const seen = new Set<string>(), queue = [toId]; while (queue.length) { const id = queue.shift()!; if (id === fromId) return true; if (seen.has(id)) continue; seen.add(id); queue.push(...(outgoing.get(id) ?? [])); } return false; }
