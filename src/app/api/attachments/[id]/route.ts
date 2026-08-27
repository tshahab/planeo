import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";
import { attachmentStorage, verifyAttachmentSignature } from "@/lib/storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const attachment = await db.attachment.findFirst({ where: { id, issue: { workspaceId: context.workspace.id, archivedAt: null } }, include: { issue: { include: { project: { select: { key: true } } } } } });
  if (!attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  await getProjectForContext(context, attachment.issue.project.key);
  const query = new URL(request.url).searchParams;
  const expires = Number(query.get("expires"));
  const signature = query.get("signature") ?? "";
  if ((query.has("expires") || query.has("signature")) && !verifyAttachmentSignature(context.workspace.id, id, expires, signature)) return NextResponse.json({ error: "Attachment link is invalid or expired." }, { status: 403 });
  const bytes = await attachmentStorage.get(attachment.objectKey).catch(() => null);
  if (!bytes) return NextResponse.json({ error: "Attachment file is unavailable." }, { status: 404 });
  const safeName = attachment.fileName.replace(/["\r\n]/g, "_");
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": attachment.contentType, "Content-Length": String(attachment.size), "Content-Disposition": `attachment; filename="${safeName}"`, "X-Content-Type-Options": "nosniff" } });
}
