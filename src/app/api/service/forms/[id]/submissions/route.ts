import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateCustomFieldWrites } from "@/lib/custom-fields";
import { requireProjectPermission } from "@/lib/permissions";
import { validatePortalSubmission } from "@/lib/service-requests";
import { enqueueAutomation } from "@/lib/automation";
import { enqueueWebhook } from "@/lib/webhooks";
import { publishRealtime } from "@/lib/realtime";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  const type = await db.serviceRequestType.findFirst({
    where: { id, archivedAt: null, publishedAt: { not: null }, project: { workspaceId: context.workspace.id, template: "SERVICE", archivedAt: null } },
    include: { project: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const version = type?.versions[0];
  if (!type || !version || !await requireProjectPermission(context, type.projectId, "issue.create")) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  try {
    const result = await db.$transaction(async (tx) => {
      const validated = validatePortalSubmission(version.schema, body.values, version.consentText);
      const byKind = new Map(validated.schema.fields.map((field) => [field.kind, field]));
      const summaryField = byKind.get("summary")!;
      const summaryValue = validated.values[summaryField.key];
      if (typeof summaryValue !== "string" || !summaryValue.trim() || summaryValue.trim().length > 200) throw new Error("Summary is required and must be 200 characters or fewer.");
      const descriptionField = byKind.get("description");
      const description = descriptionField && typeof validated.values[descriptionField.key] === "string" ? validated.values[descriptionField.key] as string : "";
      const priorityField = byKind.get("priority");
      const priorityValue = priorityField ? validated.values[priorityField.key] : undefined;
      const rawPriority = typeof priorityValue === "string" ? priorityValue.toUpperCase() : type.project.defaultPriority;
      const priority = (["URGENT", "HIGH", "MEDIUM", "LOW"] as const).find((candidate) => candidate === rawPriority) ?? type.project.defaultPriority;
      const customInput = Object.fromEntries(validated.schema.fields.flatMap((field) => field.kind === "custom" && field.customFieldId && field.key in validated.values ? [[field.customFieldId, validated.values[field.key]]] : []));
      const uploadIds = validated.schema.fields.flatMap((field) => field.kind === "attachment" && Array.isArray(validated.values[field.key]) ? validated.values[field.key] as string[] : []);
      const uploads = uploadIds.length ? await tx.serviceRequestUpload.findMany({ where: { id: { in: uploadIds }, workspaceId: context.workspace.id, projectId: type.projectId, requestTypeId: type.id, uploadedById: context.user.id, usedAt: null, expiresAt: { gt: new Date() } } }) : [];
      if (uploads.length !== new Set(uploadIds).size) throw new Error("One or more attachments are invalid or expired.");
      // Agent-only required fields are intentionally absent from the portal and are completed during triage.
      const customFields = await validateCustomFieldWrites(tx, { workspaceId: context.workspace.id, projectId: type.projectId, issueTypeId: type.issueTypeId, values: customInput, partial: true });
      const sequence = await tx.project.update({ where: { id: type.projectId }, data: { issueSequence: { increment: 1 } }, select: { issueSequence: true } });
      const issue = await tx.issue.create({ data: { workspaceId: context.workspace.id, projectId: type.projectId, number: sequence.issueSequence, issueTypeId: type.issueTypeId, statusId: type.initialStatusId, reporterId: context.user.id, summary: summaryValue.trim(), description, priority, rank: `a${Date.now().toString(36)}` } });
      if (customFields.size) await tx.customFieldValue.createMany({ data: [...customFields].map(([fieldId, value]) => ({ fieldId, issueId: issue.id, workspaceId: context.workspace.id, projectId: type.projectId, value })) });
      const serviceRequest = await tx.serviceRequest.create({ data: { workspaceId: context.workspace.id, projectId: type.projectId, issueId: issue.id, requestTypeId: type.id, requestTypeVersionId: version.id, submittedValues: validated.values as never, renderedSchema: version.schema as never, consentAcceptedAt: version.consentText ? new Date() : null } });
      if (uploads.length) {
        const claimed = await tx.serviceRequestUpload.updateMany({ where: { id: { in: uploads.map(({ id: uploadId }) => uploadId) }, usedAt: null }, data: { usedAt: new Date() } });
        if (claimed.count !== uploads.length) throw new Error("An attachment was already submitted.");
        await tx.attachment.createMany({ data: uploads.map((upload) => ({ issueId: issue.id, fileName: upload.fileName, objectKey: upload.objectKey, contentType: upload.contentType, size: upload.size })) });
      }
      await tx.issueActivity.create({ data: { issueId: issue.id, actorId: context.user.id, action: "service.request.created", changes: { requestTypeId: type.id, version: version.version } } });
      await tx.issueHistory.create({ data: { workspaceId: context.workspace.id, projectId: type.projectId, issueId: issue.id, event: "CREATED", statusCategory: (await tx.status.findUniqueOrThrow({ where: { id: type.initialStatusId } })).category, estimate: null } });
      await tx.auditEvent.create({ data: { workspaceId: context.workspace.id, actorId: context.user.id, action: "service.request.submitted", targetType: "issue", targetId: issue.id, metadata: { projectId: type.projectId, requestTypeId: type.id, requestTypeVersion: version.version } } });
      await enqueueWebhook(tx, { workspaceId: context.workspace.id, projectId: type.projectId, event: "issue.created", eventId: `issue.created:${issue.id}`, data: { id: issue.id, key: `${type.project.key}-${issue.number}`, requestTypeId: type.id, version: issue.version } });
      await enqueueAutomation(tx, { workspaceId: context.workspace.id, projectId: type.projectId, event: "issue.created", eventId: `issue.created:${issue.id}`, payload: { issueId: issue.id, projectId: type.projectId, statusId: issue.statusId, priority: issue.priority, requestTypeId: type.id } });
      await publishRealtime(tx, { workspaceId: context.workspace.id, projectId: type.projectId, type: "issue.created", resourceId: issue.id, payload: { id: issue.id, version: issue.version } });
      return { serviceRequestId: serviceRequest.id, issueId: issue.id, key: `${type.project.key}-${issue.number}` };
    });
    return NextResponse.json({ request: result }, { status: 201 });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Request could not be submitted." }, { status: 400 }); }
}
