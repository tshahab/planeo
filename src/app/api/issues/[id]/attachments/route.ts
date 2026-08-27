import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";
import { attachmentDownloadUrl, attachmentStorage } from "@/lib/storage";

const maxBytes = 10 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "application/zip", "application/json", "text/plain", "text/csv"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (context.role === "VIEWER") return NextResponse.json({ error: "Viewers cannot upload attachments." }, { status: 403 });
  const { id } = await params;
  const issue = await db.issue.findFirst({ where: { id, workspaceId: context.workspace.id, archivedAt: null }, include: { project: { select: { id: true, key: true } } } });
  if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  const project = await getProjectForContext(context, issue.project.key);
  const membership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } }, select: { role: true } });
  if (membership?.role === "VIEWER") return NextResponse.json({ error: "Project viewers cannot upload attachments." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > maxBytes) return NextResponse.json({ error: "Attachments cannot exceed 10 MB." }, { status: 400 });
  if (!(file.type.startsWith("image/") || allowedTypes.has(file.type))) return NextResponse.json({ error: "This file type is not allowed." }, { status: 400 });

  const extension = path.extname(file.name).slice(0, 12).replace(/[^.a-zA-Z0-9]/g, "");
  const objectKey = `${context.workspace.id}/${issue.project.id}/${randomUUID()}${extension}`;
  await attachmentStorage.put(objectKey, new Uint8Array(await file.arrayBuffer()));
  try {
    const attachment = await db.$transaction(async (tx) => {
      const created = await tx.attachment.create({ data: { issueId: id, fileName: file.name.slice(0, 255), objectKey, contentType: file.type, size: file.size } });
      await tx.issueActivity.create({ data: { issueId: id, actorId: context.user.id, action: "attachment.added", changes: { attachmentId: created.id, fileName: created.fileName } } });
      return created;
    });
    return NextResponse.json({ attachment: { id: attachment.id, fileName: attachment.fileName, contentType: attachment.contentType, size: attachment.size, createdAt: attachment.createdAt, downloadUrl: attachmentDownloadUrl(context.workspace.id, attachment.id) } }, { status: 201 });
  } catch (cause) {
    await attachmentStorage.delete(objectKey);
    throw cause;
  }
}
