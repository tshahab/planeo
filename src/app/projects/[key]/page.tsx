import { notFound, redirect } from "next/navigation";
import { WorkspaceApp } from "@/components/workspace-app";
import { getAuthContext } from "@/lib/auth";
import { getProjectForContext } from "@/lib/issue-query";
import { listAccessibleProjects } from "@/lib/project-query";
import { db } from "@/lib/db";

export default async function ProjectPage({ params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  const { key } = await params;
  const [project, projects] = await Promise.all([
    getProjectForContext(context, key).catch(() => null),
    listAccessibleProjects(context),
  ]);
  if (!project) notFound();
  const [projectMembership, statuses, issueTypes, members, activeSprint] = await Promise.all([
    db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } }, select: { role: true } }),
    db.status.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" }, select: { id: true, name: true, color: true, category: true } }),
    db.issueType.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" }, select: { id: true, name: true, kind: true } }),
    db.projectMember.findMany({ where: { projectId: project.id, user: { memberships: { some: { workspaceId: context.workspace.id, deactivatedAt: null } } } }, orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true } } } }),
    db.sprint.findFirst({ where: { projectId: project.id, state: "ACTIVE" }, orderBy: { startsAt: "desc" }, select: { id: true, name: true, endsAt: true } }),
  ]);
  const canManageProject = context.role === "OWNER" || context.role === "ADMIN" || projectMembership?.role === "ADMIN";
  const canWriteProject = context.role !== "VIEWER" && projectMembership?.role !== "VIEWER";
  return <WorkspaceApp
    currentUser={{ id: context.user.id, name: context.user.name, initials: context.user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), color: "#7967e8" }}
    workspaceName={context.workspace.name}
    project={{ id: project.id, key: project.key, name: project.name, description: project.description ?? undefined, template: project.template, visibility: project.visibility }}
    projects={projects.map((item) => ({ ...item, description: item.description ?? undefined }))}
    statuses={statuses}
    issueTypes={issueTypes}
    projectPeople={members.map(({ user }) => ({ id: user.id, name: user.name, initials: user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), color: avatarColor(user.id) }))}
    activeSprint={activeSprint ? { ...activeSprint, endsAt: activeSprint.endsAt?.toISOString() } : null}
    canManageProjects={context.role === "OWNER" || context.role === "ADMIN"}
    canManageProject={canManageProject}
    canWriteProject={canWriteProject}
  />;
}

function avatarColor(value: string) { const colors = ["#7967e8", "#0b9f8d", "#dc6c56", "#3f7acb", "#b169a8"]; let hash = 0; for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0; return colors[Math.abs(hash) % colors.length]; }
