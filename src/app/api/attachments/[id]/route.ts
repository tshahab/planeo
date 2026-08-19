import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";

const storageRoot = "/app/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const attachment = await db.attachment.findFirst({ where: { id, issue: { workspaceId: context.workspace.id, archivedAt: null } }, include: { issue: { include: { project: { select: { key: true } } } } } });
  if (!attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  await getProjectForContext(context, attachment.issue.project.key);
  const absolutePath = path.resolve(/* turbopackIgnore: true */ storageRoot, attachment.objectKey);
  if (!absolutePath.startsWith(`${path.resolve(/* turbopackIgnore: true */ storageRoot)}${path.sep}`)) return NextResponse.json({ error: "Attachment path is invalid." }, { status: 400 });
  const bytes = await readFile(/* turbopackIgnore: true */ absolutePath).catch(() => null);
  if (!bytes) return NextResponse.json({ error: "Attachment file is unavailable." }, { status: 404 });
  const safeName = attachment.fileName.replace(/["\r\n]/g, "_");
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": attachment.contentType, "Content-Length": String(attachment.size), "Content-Disposition": `attachment; filename="${safeName}"`, "X-Content-Type-Options": "nosniff" } });
}
