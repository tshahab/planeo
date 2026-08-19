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
  const projectMembership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: context.user.id } }, select: { role: true } });
  const canManageProject = context.role === "OWNER" || context.role === "ADMIN" || projectMembership?.role === "ADMIN";
  const canWriteProject = context.role !== "VIEWER" && projectMembership?.role !== "VIEWER";
  return <WorkspaceApp
    currentUser={{ id: context.user.id, name: context.user.name, initials: context.user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), color: "#7967e8" }}
    workspaceName={context.workspace.name}
    project={{ id: project.id, key: project.key, name: project.name, description: project.description ?? undefined, template: project.template, visibility: project.visibility }}
    projects={projects.map((item) => ({ ...item, description: item.description ?? undefined }))}
    canManageProjects={context.role === "OWNER" || context.role === "ADMIN"}
    canManageProject={canManageProject}
    canWriteProject={canWriteProject}
  />;
}
