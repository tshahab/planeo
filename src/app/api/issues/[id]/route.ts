import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { toUiIssue } from "@/lib/issue-mapper";
import { getProjectForContext, issueInclude } from "@/lib/issue-query";
import type { Prisma } from "@prisma/client";
import { createIssueNotifications, mentionedEmails } from "@/lib/notifications";
import { enqueueWebhook } from "@/lib/webhooks";
import { validateCustomFieldWrites } from "@/lib/custom-fields";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role === "VIEWER") return NextResponse.json({ error: "Viewers cannot update issues." }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const issueScope = await db.issue.findFirst({ where: { id, workspaceId: context.workspace.id, archivedAt: null }, include: { project: { select: { key: true } } } });
  if (!issueScope) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  const project = await getProjectForContext(context, issueScope.project.key);
  const projectMembership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } }, select: { role: true } });
  if (projectMembership?.role === "VIEWER") return NextResponse.json({ error: "Project viewers cannot update issues." }, { status: 403 });
  const existing = await db.issue.findFirst({ where: { id, workspaceId: project.workspaceId, projectId: project.id, archivedAt: null }, include: { watchers: { select: { userId: true } } } });
  if (!existing) return NextResponse.json({ error: "Issue not found." }, { status: 404 });

  const data: { statusId?: string; summary?: string; description?: string; priority?: "URGENT" | "HIGH" | "MEDIUM" | "LOW"; estimate?: number | null; assigneeId?: string | null; dueDate?: Date | null; completedAt?: Date | null } = {};
  const changes: Record<string, unknown> = {};
  let labelNames: string[] | undefined;

  if (body?.status !== undefined) {
    if (typeof body.status !== "string") return NextResponse.json({ error: "A valid status is required." }, { status: 400 });
    const status = await db.status.findFirst({ where: { projectId: project.id, name: body.status } });
    if (!status) return NextResponse.json({ error: "Status is not part of this project." }, { status: 400 });
    if (status.id !== existing.statusId) {
      const [transitionCount, allowedTransition, column] = await Promise.all([
        db.workflowTransition.count({ where: { projectId: project.id } }),
        db.workflowTransition.findUnique({ where: { projectId_fromStatusId_toStatusId: { projectId: project.id, fromStatusId: existing.statusId, toStatusId: status.id } } }),
        db.boardColumn.findFirst({ where: { statusId: status.id, board: { projectId: project.id } } }),
      ]);
      if (transitionCount > 0 && !allowedTransition) return NextResponse.json({ error: "That workflow transition is not allowed." }, { status: 409 });
      if (column?.wipLimit) { const count = await db.issue.count({ where: { projectId: project.id, statusId: status.id, archivedAt: null } }); if (count >= column.wipLimit) return NextResponse.json({ error: `${column.name} has reached its work-in-progress limit.` }, { status: 409 }); }
    }
    data.statusId = status.id;
    data.completedAt = status.category === "DONE" ? new Date() : null;
    changes.status = { from: existing.statusId, to: status.id };
  }
  if (body?.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 200) return NextResponse.json({ error: "Title must contain 1–200 characters." }, { status: 400 });
    data.summary = title;
    changes.title = { from: existing.summary, to: title };
  }
  if (body?.description !== undefined) {
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > 20_000) return NextResponse.json({ error: "Description cannot exceed 20,000 characters." }, { status: 400 });
    data.description = description;
    changes.description = true;
  }
  if (body?.priority !== undefined) {
    const priority = typeof body.priority === "string" ? body.priority.toUpperCase() : "";
    if (!(["URGENT", "HIGH", "MEDIUM", "LOW"] as const).includes(priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW")) return NextResponse.json({ error: "Priority is invalid." }, { status: 400 });
    data.priority = priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW";
    changes.priority = { from: existing.priority, to: priority };
  }
  if (body?.estimate !== undefined) {
    if (body.estimate !== null && (!Number.isInteger(body.estimate) || Number(body.estimate) < 0 || Number(body.estimate) > 100)) return NextResponse.json({ error: "Estimate must be a whole number from 0–100." }, { status: 400 });
    data.estimate = body.estimate === null ? null : Number(body.estimate);
    changes.estimate = { from: existing.estimate, to: data.estimate };
  }
  if (body?.assigneeId !== undefined) {
    if (body.assigneeId !== null && typeof body.assigneeId !== "string") return NextResponse.json({ error: "Assignee is invalid." }, { status: 400 });
    if (typeof body.assigneeId === "string") {
      const assignee = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: body.assigneeId } } });
      if (!assignee) return NextResponse.json({ error: "Assignee must be a project member." }, { status: 400 });
    }
    data.assigneeId = body.assigneeId as string | null;
    changes.assignee = { from: existing.assigneeId, to: data.assigneeId };
  }
  if (body?.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === "") data.dueDate = null;
    else {
      if (typeof body.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) return NextResponse.json({ error: "Due date is invalid." }, { status: 400 });
      const dueDate = new Date(`${body.dueDate}T12:00:00.000Z`);
      if (Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: "Due date is invalid." }, { status: 400 });
      data.dueDate = dueDate;
    }
    changes.dueDate = { from: existing.dueDate?.toISOString() ?? null, to: data.dueDate?.toISOString() ?? null };
  }
  if (body?.labels !== undefined) {
    if (!Array.isArray(body.labels) || body.labels.some((label) => typeof label !== "string")) return NextResponse.json({ error: "Labels are invalid." }, { status: 400 });
    labelNames = [...new Set((body.labels as string[]).map((label) => label.trim()).filter(Boolean))];
    if (labelNames.length > 10 || labelNames.some((label) => label.length > 50)) return NextResponse.json({ error: "Use up to 10 labels, each 50 characters or fewer." }, { status: 400 });
    changes.labels = labelNames;
  }
  const hasCustomFields = body?.customFields !== undefined;
  if (Object.keys(data).length === 0 && labelNames === undefined && !hasCustomFields) return NextResponse.json({ error: "No supported changes were provided." }, { status: 400 });
  const mentions = typeof data.description === "string" ? await db.user.findMany({ where: { email: { in: mentionedEmails(data.description), mode: "insensitive" }, memberships: { some: { workspaceId: project.workspaceId } }, OR: [{ projectRoles: { some: { projectId: project.id } } }, ...(project.visibility === "PUBLIC" ? [{}] : [])] }, select: { id: true } }) : [];

  let issue;
  try { issue = await db.$transaction(async (tx) => {
    const customFields = hasCustomFields ? await validateCustomFieldWrites(tx, { workspaceId: project.workspaceId, projectId: project.id, issueTypeId: existing.issueTypeId, values: body?.customFields, partial: true }) : new Map();
    if (labelNames !== undefined) {
      const labels = await Promise.all(labelNames.map((name) => tx.label.upsert({ where: { workspaceId_name: { workspaceId: project.workspaceId, name } }, update: {}, create: { workspaceId: project.workspaceId, name, color: labelColor(name) } })));
      await tx.issueLabel.deleteMany({ where: { issueId: id } });
      if (labels.length) await tx.issueLabel.createMany({ data: labels.map((label) => ({ issueId: id, labelId: label.id })) });
    }
    const updated = await tx.issue.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      include: issueInclude,
    });
    for (const [fieldId, value] of customFields) await tx.customFieldValue.upsert({ where: { fieldId_issueId: { fieldId, issueId: id } }, update: { value }, create: { fieldId, issueId: id, workspaceId: project.workspaceId, projectId: project.id, value } });
    const activity = await tx.issueActivity.create({
      data: { issueId: id, actorId: context.user.id, action: data.statusId && Object.keys(changes).length === 1 ? "issue.status_changed" : "issue.updated", changes: JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonValue },
    });
    if (data.statusId !== undefined || data.estimate !== undefined) await tx.issueHistory.create({ data: { workspaceId: project.workspaceId, projectId: project.id, issueId: id, event: data.statusId !== undefined ? "STATUS_CHANGED" : "ESTIMATE_CHANGED", statusCategory: updated.status.category, estimate: updated.estimate } });
    const base = { workspaceId: project.workspaceId, issueId: id, issueKey: `${project.key}-${existing.number}`, issueTitle: data.summary ?? existing.summary, actorId: context.user.id, eventId: activity.id };
    if (data.assigneeId && data.assigneeId !== existing.assigneeId) await createIssueNotifications(tx, { ...base, type: "ASSIGNED", recipientIds: [data.assigneeId] });
    await createIssueNotifications(tx, { ...base, type: "MENTIONED", recipientIds: mentions.map(({ id: userId }) => userId) });
    await createIssueNotifications(tx, { ...base, type: "ISSUE_UPDATED", recipientIds: existing.watchers.map(({ userId }) => userId) });
    await enqueueWebhook(tx, { workspaceId: project.workspaceId, projectId: project.id, event: "issue.updated", eventId: `issue.updated:${id}:${updated.version}`, data: { id, key: `${project.key}-${existing.number}`, version: updated.version } });
    return customFields.size ? tx.issue.findUniqueOrThrow({ where: { id }, include: issueInclude }) : updated;
  }); } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Issue could not be updated." }, { status: 400 }); }
  return NextResponse.json({ issue: toUiIssue(issue, project.key) });
}

function labelColor(value: string) { const colors = ["#6558d7", "#1f8f72", "#c56a43", "#3978b8", "#a14d85"]; let hash = 0; for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0; return colors[Math.abs(hash) % colors.length]; }
