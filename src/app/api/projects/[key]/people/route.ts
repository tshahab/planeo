import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProjectForContext } from "@/lib/issue-query";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { key } = await params;
  const project = await getProjectForContext(context, key).catch(() => null);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const members = await db.projectMember.findMany({ where: { projectId: project.id }, include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } });
  return NextResponse.json({ people: members.map(({ user }) => ({ ...user, initials: user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), color: avatarColor(user.id) })) });
}

function avatarColor(value: string) { const colors = ["#7967e8", "#0b9f8d", "#dc6c56", "#3f7acb", "#b169a8"]; let hash = 0; for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0; return colors[Math.abs(hash) % colors.length]; }
