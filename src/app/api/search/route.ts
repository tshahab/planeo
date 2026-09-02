import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { issueInclude } from "@/lib/issue-query";
import { toUiIssue } from "@/lib/issue-mapper";
import { accessibleProjectWhere } from "@/lib/project-query";
import { issueSecurityWhere } from "@/lib/permissions";

const PAGE_SIZE = 25;
const priorities = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
const sorts = ["updated", "created", "priority", "due", "rank"] as const;

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 200);
  const page = positiveInt(params.get("page"), 1);
  const sort = sorts.find((value) => value === params.get("sort")) ?? "updated";
  const priority = priorities.find((value) => value === params.get("priority")?.toUpperCase());
  const from = dateParam(params.get("from"));
  const to = dateParam(params.get("to"), true);
  const customFieldId = params.get("customFieldId");
  let customFieldValue: Prisma.InputJsonValue | undefined;
  if (customFieldId && params.has("customFieldValue")) { try { customFieldValue = JSON.parse(params.get("customFieldValue")!) as Prisma.InputJsonValue; } catch { return NextResponse.json({ error: "Custom-field filter value must be valid JSON." }, { status: 400 }); } }
  if (params.get("from") && !from || params.get("to") && !to) return NextResponse.json({ error: "Dates must use YYYY-MM-DD." }, { status: 400 });

  const exactKey = /^([A-Z][A-Z0-9]{1,9})-(\d+)$/i.exec(query);
  const where: Prisma.IssueWhereInput = {
    workspaceId: context.workspace.id,
    archivedAt: null,
    parentId: null,
    AND: [await issueSecurityWhere(context)],
    project: { is: accessibleProjectWhere(context) },
    ...(query ? { OR: [
      { summary: { contains: query, mode: "insensitive" } },
      { description: { string_contains: query } },
      ...(exactKey ? [{ project: { is: { ...accessibleProjectWhere(context), key: exactKey[1].toUpperCase() } }, number: Number(exactKey[2]) }] : []),
    ] } : {}),
    ...(params.get("project") ? { project: { is: { ...accessibleProjectWhere(context), key: params.get("project")!.toUpperCase() } } } : {}),
    ...(params.get("type") ? { issueTypeId: params.get("type")! } : {}),
    ...(params.get("status") ? { statusId: params.get("status")! } : {}),
    ...(params.get("assignee") ? { assigneeId: params.get("assignee")! } : {}),
    ...(params.get("reporter") ? { reporterId: params.get("reporter")! } : {}),
    ...(priority ? { priority } : {}),
    ...(params.get("label") ? { labels: { some: { labelId: params.get("label")! } } } : {}),
    ...(params.get("sprint") ? { sprintIssues: { some: { sprintId: params.get("sprint")! } } } : {}),
    ...(params.get("release") ? { releases: { some: { releaseId: params.get("release")! } } } : {}),
    ...(params.get("requestType") ? { serviceRequest: { requestTypeId: params.get("requestType")! } } : {}),
    ...(customFieldId ? { customFieldValues: { some: { fieldId: customFieldId, field: { workspaceId: context.workspace.id }, ...(customFieldValue === undefined ? {} : { value: { equals: customFieldValue } }) } } } : {}),
    ...(params.get("overdue") === "true" ? { dueDate: { lt: new Date() }, status: { category: { not: "DONE" } } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const orderBy: Prisma.IssueOrderByWithRelationInput[] = sort === "created" ? [{ createdAt: "desc" }] : sort === "priority" ? [{ priority: "asc" }, { updatedAt: "desc" }] : sort === "due" ? [{ dueDate: { sort: "asc", nulls: "last" } }] : sort === "rank" ? [{ rank: "asc" }] : [{ updatedAt: "desc" }];
  const [total, records, projects, members, labels, sprints, releases, requestTypes] = await Promise.all([
    db.issue.count({ where }),
    db.issue.findMany({ where, include: { ...issueInclude, project: { select: { key: true, name: true } } }, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.project.findMany({ where: accessibleProjectWhere(context), orderBy: { name: "asc" }, select: { id: true, key: true, name: true, statuses: { orderBy: { position: "asc" }, select: { id: true, name: true } }, issueTypes: { orderBy: { position: "asc" }, select: { id: true, name: true } } } }),
    db.workspaceMember.findMany({ where: { workspaceId: context.workspace.id }, orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true } } } }),
    db.label.findMany({ where: { workspaceId: context.workspace.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.sprint.findMany({ where: { project: accessibleProjectWhere(context), state: { in: ["PLANNED", "ACTIVE"] } }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, name: true, projectId: true } }),
    db.release.findMany({ where: { project: accessibleProjectWhere(context) }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, name: true, projectId: true, archivedAt: true } }),
    db.serviceRequestType.findMany({ where: { archivedAt: null, project: accessibleProjectWhere(context) }, orderBy: { name: "asc" }, select: { id: true, name: true, projectId: true } }),
  ]);
  const results = records.map((record) => ({ ...toUiIssue(record, record.project.key), projectName: record.project.name }));
  if (exactKey) results.sort((a, b) => Number(b.key.toUpperCase() === query.toUpperCase()) - Number(a.key.toUpperCase() === query.toUpperCase()));
  return NextResponse.json({ results, total, page, pageSize: PAGE_SIZE, filters: { projects, members: members.map(({ user }) => user), labels, sprints, releases, requestTypes } });
}

function positiveInt(value: string | null, fallback: number) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 && parsed <= 10_000 ? parsed : fallback; }
function dateParam(value: string | null, end = false) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`); return Number.isNaN(date.getTime()) ? null : date; }
