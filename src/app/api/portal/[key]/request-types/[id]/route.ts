import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateCustomFieldWrites } from "@/lib/custom-fields";
import { issueInclude } from "@/lib/issue-query";
import { toUiIssue } from "@/lib/issue-mapper";
import { enqueueAutomation } from "@/lib/automation";
import { enqueueWebhook } from "@/lib/webhooks";
import { publishRealtime } from "@/lib/realtime";
import { validateRequestSubmission, type RequestFormSchema } from "@/lib/request-forms";

async function published(context: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>, key: string, id: string) {
  const admin = context.role === "OWNER" || context.role === "ADMIN";
  const requestType = await db.requestType.findFirst({ where: { id, status: "PUBLISHED", project: { workspaceId: context.workspace.id, key: key.toUpperCase(), template: "SERVICE", archivedAt: null, ...(admin ? {} : { OR: [{ visibility: "PUBLIC" }, { members: { some: { userId: context.user.id } } }] }) } }, include: { project: true, issueType: true, initialStatus: true, portalGroup: true } });
  if (!requestType?.publishedVersion) return null;
  const version = await db.requestTypeVersion.findUnique({ where: { requestTypeId_version: { requestTypeId: id, version: requestType.publishedVersion } } });
  return version ? { requestType, version } : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key, id } = await params, item = await published(context, key, id);
  if (!item) return NextResponse.json({ error: "Request form not found." }, { status: 404 });
  return NextResponse.json({ requestType: { id: item.requestType.id, name: item.requestType.name, description: item.requestType.description, icon: item.requestType.icon, group: item.requestType.portalGroup, version: item.version.version }, schema: item.version.schema });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string; id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key, id } = await params, item = await published(context, key, id);
  if (!item) return NextResponse.json({ error: "Request form not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    const values = validateRequestSubmission(item.version.schema as unknown as RequestFormSchema, body?.values);
    const issue = await db.$transaction(async tx => {
      const customInput = Object.fromEntries((item.version.schema as unknown as RequestFormSchema).fields.filter(field => field.customFieldId && values[field.key] !== undefined).map(field => [field.customFieldId!, values[field.key]]));
      const customFields = await validateCustomFieldWrites(tx, { workspaceId: item.requestType.project.workspaceId, projectId: item.requestType.projectId, issueTypeId: item.requestType.issueTypeId, values: customInput, partial: true });
      const project = await tx.project.update({ where: { id: item.requestType.projectId }, data: { issueSequence: { increment: 1 } }, select: { issueSequence: true } });
      const created = await tx.issue.create({ data: { workspaceId: item.requestType.project.workspaceId, projectId: item.requestType.projectId, number: project.issueSequence, issueTypeId: item.requestType.issueTypeId, statusId: item.requestType.initialStatusId, reporterId: context.user.id, summary: String(values.summary).trim().slice(0, 200), description: typeof values.description === "string" ? values.description.trim() : "", priority: typeof values.priority === "string" && ["URGENT", "HIGH", "MEDIUM", "LOW"].includes(values.priority) ? values.priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW" : item.requestType.project.defaultPriority, rank: `a${Date.now().toString(36)}`, requestTypeVersionId: item.version.id }, include: issueInclude });
      if (customFields.size) await tx.customFieldValue.createMany({ data: [...customFields].map(([fieldId, value]) => ({ fieldId, issueId: created.id, workspaceId: created.workspaceId, projectId: created.projectId, value })) });
      await tx.issueActivity.create({ data: { issueId: created.id, actorId: context.user.id, action: "portal.request.created", metadata: { requestTypeId: id, requestTypeVersion: item.version.version } } });
      await tx.issueHistory.create({ data: { workspaceId: created.workspaceId, projectId: created.projectId, issueId: created.id, event: "CREATED", statusCategory: item.requestType.initialStatus.category } });
      await tx.auditEvent.create({ data: { workspaceId: created.workspaceId, actorId: context.user.id, action: "portal.request.submitted", targetType: "issue", targetId: created.id, metadata: { projectId: created.projectId, requestTypeId: id, requestTypeVersion: item.version.version } } });
      const payload = { issueId: created.id, projectId: created.projectId, requestTypeId: id, requestTypeVersion: item.version.version };
      await enqueueWebhook(tx, { workspaceId: created.workspaceId, projectId: created.projectId, event: "issue.created", eventId: `issue.created:${created.id}`, data: payload });
      await enqueueAutomation(tx, { workspaceId: created.workspaceId, projectId: created.projectId, event: "issue.created", eventId: `issue.created:${created.id}`, payload });
      await publishRealtime(tx, { workspaceId: created.workspaceId, projectId: created.projectId, type: "issue.created", resourceId: created.id, payload });
      return tx.issue.findUniqueOrThrow({ where: { id: created.id }, include: issueInclude });
    });
    return NextResponse.json({ issue: toUiIssue(issue, item.requestType.project.key), formVersion: item.version.version, attachmentsUrl: `/api/issues/${issue.id}/attachments` }, { status: 201 });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Request could not be submitted." }, { status: 400 }); }
}
