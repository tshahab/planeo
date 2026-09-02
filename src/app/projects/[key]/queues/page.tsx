import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { queueProject } from "@/lib/service-queues";
import { issueSecurityWhere, requireProjectPermission } from "@/lib/permissions";
import { ServiceQueues } from "@/components/service-queues";

export default async function QueuesPage({ params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  const project = await queueProject(context, (await params).key).catch(() => null);
  if (!project) notFound();
  const [statuses, requestTypes, people, organizations, labels, canAdmin, canEdit] = await Promise.all([
    db.status.findMany({ where: { projectId: project.id }, select: { id: true, name: true }, orderBy: { position: "asc" } }),
    db.serviceRequestType.findMany({ where: { projectId: project.id, publishedAt: { not: null }, archivedAt: null }, select: { id: true, name: true } }),
    db.projectMember.findMany({ where: { projectId: project.id, role: { not: "VIEWER" }, user: { memberships: { some: { workspaceId: context.workspace.id, deactivatedAt: null, role: { not: "VIEWER" } } } } }, select: { user: { select: { id: true, name: true } } } }),
    db.portalProjectOrganization.findMany({ where: { projectId: project.id, enabled: true }, select: { organization: { select: { id: true, name: true } } } }),
    db.label.findMany({ where: { workspaceId: context.workspace.id, issues: { some: { issue: { projectId: project.id, archivedAt: null, AND: [await issueSecurityWhere(context, [project.id])] } } } }, select: { id: true, name: true } }),
    requireProjectPermission(context, project.id, "project.admin"), requireProjectPermission(context, project.id, "issue.edit"),
  ]);
  return <main className="portal-page"><header><strong>{project.name}</strong><nav><Link href={`/projects/${project.key}`}>Project overview</Link></nav></header><h1>Agent queues</h1><ServiceQueues projectKey={project.key} userId={context.user.id} canAdmin={canAdmin} canEdit={canEdit} options={{ statuses, requestTypes, people: people.map(item => item.user), organizations: organizations.map(item => item.organization), labels }} /></main>;
}
