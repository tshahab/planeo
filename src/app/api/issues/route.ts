import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { toUiIssue } from "@/lib/issue-mapper";
import { getProjectForContext, issueInclude } from "@/lib/issue-query";
import { createIssueNotifications, mentionedEmails } from "@/lib/notifications";
import { enqueueWebhook } from "@/lib/webhooks";
import { validateCustomFieldWrites } from "@/lib/custom-fields";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const searchParams = new URL(request.url).searchParams;
  const projectKey = searchParams.get("projectKey") ?? "WEB";
  const project = await getProjectForContext(context, projectKey);
  const query = searchParams.get("q")?.trim();
  const issues = await db.issue.findMany({
    where: {
      workspaceId: project.workspaceId,
      projectId: project.id,
      parentId: null,
      archivedAt: null,
      ...(query ? { OR: [
        { summary: { contains: query, mode: "insensitive" } },
        ...(/^WEB-(\d+)$/i.test(query) ? [{ number: Number(query.split("-")[1]) }] : []),
      ] } : {}),
    },
    include: issueInclude,
    orderBy: [{ status: { position: "asc" } }, { rank: "asc" }],
  });
  return NextResponse.json({ issues: issues.map((issue) => toUiIssue(issue, project.key)) });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role === "VIEWER") return NextResponse.json({ error: "Viewers cannot create issues." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200) {
    return NextResponse.json({ error: "Summary is required and must be 200 characters or fewer." }, { status: 400 });
  }
  const title = body.title.trim();
  const description = typeof body.description === "string" ? body.description.trim() : "";

  const projectKey = typeof body.projectKey === "string" ? body.projectKey : "WEB";
  const project = await getProjectForContext(context, projectKey);
  const projectMembership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } }, select: { role: true } });
  if (projectMembership?.role === "VIEWER") return NextResponse.json({ error: "Project viewers cannot create issues." }, { status: 403 });
  const [status, issueType, reporter, assignee] = await Promise.all([
    db.status.findFirstOrThrow({ where: { projectId: project.id }, orderBy: { position: "asc" } }),
    typeof body.issueTypeId === "string"
      ? db.issueType.findFirstOrThrow({ where: { projectId: project.id, id: body.issueTypeId } })
      : db.issueType.findFirstOrThrow({ where: { projectId: project.id }, orderBy: { position: "asc" } }),
    db.user.findUniqueOrThrow({ where: { id: context.user.id } }),
    typeof body.assigneeId === "string" ? db.user.findFirst({ where: {
      OR: [{ id: body.assigneeId }, { email: `${body.assigneeId}@planeo.co` }],
      projectRoles: { some: { projectId: project.id } },
    } }) : null,
  ]);

  const allowedPriorities = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
  const requestedPriority = typeof body.priority === "string" ? body.priority.toUpperCase() : project.defaultPriority;
  const priority = allowedPriorities.find((value) => value === requestedPriority) ?? project.defaultPriority;
  const mentions = await db.user.findMany({ where: { email: { in: mentionedEmails(description), mode: "insensitive" }, memberships: { some: { workspaceId: project.workspaceId } }, OR: [{ projectRoles: { some: { projectId: project.id } } }, ...(project.visibility === "PUBLIC" ? [{}] : [])] }, select: { id: true } });

  let issue;
  try { issue = await db.$transaction(async (tx) => {
    const customFields = await validateCustomFieldWrites(tx, { workspaceId: project.workspaceId, projectId: project.id, issueTypeId: issueType.id, values: body.customFields });
    const updatedProject = await tx.project.update({
      where: { id: project.id },
      data: { issueSequence: { increment: 1 } },
      select: { issueSequence: true },
    });
    const created = await tx.issue.create({
      data: {
        workspaceId: project.workspaceId,
        projectId: project.id,
        number: updatedProject.issueSequence,
        issueTypeId: issueType.id,
        statusId: status.id,
        reporterId: reporter.id,
        assigneeId: assignee?.id,
        summary: title,
        description,
        priority,
        rank: `a${Date.now().toString(36)}`,
      },
      include: issueInclude,
    });
    const activity = await tx.issueActivity.create({ data: { issueId: created.id, actorId: reporter.id, action: "issue.created" } });
    if (customFields.size) await tx.customFieldValue.createMany({ data: [...customFields].map(([fieldId, value]) => ({ fieldId, issueId: created.id, workspaceId: project.workspaceId, projectId: project.id, value })) });
    await tx.issueHistory.create({ data: { workspaceId: project.workspaceId, projectId: project.id, issueId: created.id, event: "CREATED", statusCategory: status.category, estimate: created.estimate } });
    await enqueueWebhook(tx, { workspaceId: project.workspaceId, projectId: project.id, event: "issue.created", eventId: `issue.created:${created.id}`, data: { id: created.id, key: `${project.key}-${created.number}`, version: created.version } });
    const base = { workspaceId: project.workspaceId, issueId: created.id, issueKey: `${project.key}-${created.number}`, issueTitle: created.summary, actorId: reporter.id, eventId: activity.id };
    if (created.assigneeId) await createIssueNotifications(tx, { ...base, type: "ASSIGNED", recipientIds: [created.assigneeId] });
    await createIssueNotifications(tx, { ...base, type: "MENTIONED", recipientIds: mentions.map(({ id: userId }) => userId) });
    return tx.issue.findUniqueOrThrow({ where: { id: created.id }, include: issueInclude });
  }); } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Issue could not be created." }, { status: 400 }); }

  return NextResponse.json({ issue: toUiIssue(issue, project.key) }, { status: 201 });
}
