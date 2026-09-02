import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions";
import { attachmentStorage } from "@/lib/storage";

const maxBytes = 10 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "application/zip", "application/json", "text/plain", "text/csv"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const type = await db.serviceRequestType.findFirst({ where: { id, archivedAt: null, publishedAt: { not: null }, project: { workspaceId: context.workspace.id, template: "SERVICE", archivedAt: null } }, select: { id: true, projectId: true } });
  if (!type || !await requireProjectPermission(context, type.projectId, "issue.create")) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  const form = await request.formData().catch(() => null); const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > maxBytes) return NextResponse.json({ error: "Attachments cannot exceed 10 MB." }, { status: 400 });
  if (!(file.type.startsWith("image/") || allowedTypes.has(file.type))) return NextResponse.json({ error: "This file type is not allowed." }, { status: 400 });
  const extension = path.extname(file.name).slice(0, 12).replace(/[^.a-zA-Z0-9]/g, "");
  const objectKey = `${context.workspace.id}/${type.projectId}/service-drafts/${randomUUID()}${extension}`;
  await attachmentStorage.put(objectKey, new Uint8Array(await file.arrayBuffer()));
  try {
    const upload = await db.serviceRequestUpload.create({ data: { workspaceId: context.workspace.id, projectId: type.projectId, requestTypeId: type.id, uploadedById: context.user.id, fileName: file.name.slice(0, 255), objectKey, contentType: file.type, size: file.size, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    return NextResponse.json({ upload: { id: upload.id, fileName: upload.fileName, size: upload.size } }, { status: 201 });
  } catch (cause) { await attachmentStorage.delete(objectKey); throw cause; }
}
