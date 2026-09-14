import type { Prisma } from "@prisma/client";
import type { AuthContext } from "./auth";
import { db } from "./db";
import { compileAdvancedQuery, parseAdvancedQuery } from "./advanced-query";
import { accessibleProjectWhere } from "./project-query";
import { issueSecurityWhere } from "./permissions";
import { analyzeDependencies } from "./dependency-graph";

export class PlanError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const columns = ["key", "summary", "project", "status", "assignee", "start", "due", "level", "release"];
export function validatePlanConfiguration(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlanError("Plan configuration is required."); const input = value as Record<string, unknown>;
  const selected = Array.isArray(input.columns) ? [...new Set(input.columns.filter((item): item is string => typeof item === "string" && columns.includes(item)))] : ["key", "summary", "project", "status", "start", "due"];
  if (!selected.length || selected.length > columns.length) throw new PlanError("At least one supported column is required.");
  const groupBy = ["none", "project", "status", "level", "assignee"].includes(String(input.groupBy)) ? String(input.groupBy) : "project";
  const zoom = ["week", "month", "quarter", "year"].includes(String(input.zoom)) ? String(input.zoom) : "quarter";
  const pageSize = Number.isInteger(input.pageSize) && Number(input.pageSize) >= 10 && Number(input.pageSize) <= 200 ? Number(input.pageSize) : 50;
  const timezone = typeof input.timezone === "string" && /^[A-Za-z_]+(?:\/[A-Za-z_+-]+)+$/.test(input.timezone) ? input.timezone : "UTC";
  return { columns: selected, groupBy, zoom, pageSize, timezone, showArchived: input.showArchived === true, expandHierarchy: input.expandHierarchy !== false };
}
export async function validatePlanSources(context: AuthContext, value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new PlanError("Use 1–50 plan sources.");
  const sources: Array<{ kind: string; projectId?: string; query?: string }> = [];
  for (const item of value) { if (!item || typeof item !== "object") throw new PlanError("Plan source is invalid."); const source = item as Record<string, unknown>;
    if (source.kind === "PROJECT" && typeof source.projectId === "string") { const project = await db.project.findFirst({ where: { ...accessibleProjectWhere(context), id: source.projectId }, select: { id: true } }); if (!project) throw new PlanError("Plan source is inaccessible.", 404); sources.push({ kind: "PROJECT", projectId: project.id }); }
    else if (source.kind === "QUERY" && typeof source.query === "string") { parseAdvancedQuery(source.query); sources.push({ kind: "QUERY", query: source.query }); }
    else throw new PlanError("Plan source must be an accessible project or valid query.");
  } return sources;
}
export async function visiblePlan(context: AuthContext, id: string) { const plan = await db.portfolioPlan.findFirst({ where: { id, workspaceId: context.workspace.id, archivedAt: null, OR: [{ ownerId: context.user.id }, { shared: true }] }, include: { owner: { select: { id: true, name: true } }, sources: true } }); if (!plan) throw new PlanError("Plan not found.", 404); return plan; }
export async function planItems(context: AuthContext, planId: string, page: number) {
  const plan = await visiblePlan(context, planId), config = validatePlanConfiguration(plan.configuration), sourcePredicates: Prisma.IssueWhereInput[] = [];
  for (const source of plan.sources) { if (source.kind === "PROJECT" && source.projectId) sourcePredicates.push({ projectId: source.projectId }); else if (source.kind === "QUERY" && source.query) sourcePredicates.push(compileAdvancedQuery(source.query).where); }
  const where: Prisma.IssueWhereInput = { workspaceId: context.workspace.id, ...(config.showArchived ? {} : { archivedAt: null }), project: { is: accessibleProjectWhere(context) }, AND: [await issueSecurityWhere(context), { OR: sourcePredicates }] };
  const boundedPage = Number.isInteger(page) && page > 0 && page <= 10_000 ? page : 1;
  const [total, items] = await Promise.all([db.issue.count({ where }), db.issue.findMany({ where, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { id: "asc" }], skip: (boundedPage - 1) * config.pageSize, take: config.pageSize, select: { id: true, number: true, summary: true, dueDate: true, createdAt: true, updatedAt: true, completedAt: true, project: { select: { id: true, key: true, name: true } }, status: { select: { name: true, category: true } }, assignee: { select: { id: true, name: true } }, hierarchyLevel: { select: { id: true, name: true, color: true, position: true } }, parentId: true, releases: { select: { release: { select: { id: true, name: true, releaseDate: true } } } } } })]);
  return { plan, configuration: config, page: boundedPage, pageSize: config.pageSize, total, items: items.map(item => ({ ...item, key: `${item.project.key}-${item.number}`, startDate: item.createdAt.toISOString().slice(0, 10), dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null, unscheduled: !item.dueDate })) };
}

export async function planDependencyInsights(context: AuthContext, planId: string) {
  const plan = await visiblePlan(context, planId), config = validatePlanConfiguration(plan.configuration), sourcePredicates: Prisma.IssueWhereInput[] = [];
  for (const source of plan.sources) { if (source.kind === "PROJECT" && source.projectId) sourcePredicates.push({ projectId: source.projectId }); else if (source.kind === "QUERY" && source.query) sourcePredicates.push(compileAdvancedQuery(source.query).where); }
  const where: Prisma.IssueWhereInput = { workspaceId: context.workspace.id, ...(config.showArchived ? {} : { archivedAt: null }), project: { is: accessibleProjectWhere(context) }, AND: [await issueSecurityWhere(context), { OR: sourcePredicates }] };
  const nodes = await db.issue.findMany({ where, orderBy: { id: "asc" }, take: 1000, select: { id:true,number:true,summary:true,projectId:true,dueDate:true,estimate:true,completedAt:true,status:{select:{category:true}},project:{select:{key:true,name:true}} } });
  const ids = nodes.map(node=>node.id), edges = ids.length ? await db.issueLink.findMany({ where: { type:"blocks",outwardIssueId:{in:ids},inwardIssueId:{in:ids} },orderBy:{id:"asc"},take:5000 }) : [];
  return { plan:{id:plan.id,name:plan.name}, bounded: nodes.length === 1000 || edges.length === 5000, ...analyzeDependencies(nodes.map(node=>({id:node.id,key:`${node.project.key}-${node.number}`,summary:node.summary,projectId:node.projectId,projectName:node.project.name,dueDate:node.dueDate,estimate:node.estimate,completed:node.completedAt!==null||node.status.category==="DONE"})),edges.map(edge=>({id:edge.id,fromId:edge.outwardIssueId,toId:edge.inwardIssueId,type:edge.type,lagDays:edge.lagDays,version:edge.version}))) };
}
