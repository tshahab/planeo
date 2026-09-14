import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalContext } from "@/lib/portal-auth";
export async function GET(request: Request, { params }: { params: Promise<{ workspace: string }> }) {
  const context = await getPortalContext(); const { workspace } = await params; if (!context || context.workspace.slug !== workspace) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const articles = await db.knowledgeArticle.findMany({ where: { publishedAt: { not: null }, archivedAt: null, space: { workspaceId: context.workspace.id }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { versions: { some: { body: { contains: q, mode: "insensitive" } } } }] } : {}) }, include: { space: { select: { name: true, slug: true, language: true } }, versions: { where: { }, orderBy: { version: "desc" }, take: 1, select: { body: true, version: true } } }, orderBy: { publishedAt: "desc" }, take: 50 });
  return NextResponse.json({ articles: articles.map(article => ({ id: article.id, slug: article.slug, title: article.title, space: article.space, version: article.versions[0]?.version, excerpt: article.versions[0]?.body.replace(/<[^>]+>/g, "").slice(0, 240) })) });
}
