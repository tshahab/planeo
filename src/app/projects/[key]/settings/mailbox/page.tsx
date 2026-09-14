import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { queueProject } from "@/lib/service-queues";
import { requireProjectPermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { MailboxSettings } from "@/components/mailbox-settings";
export default async function MailboxPage({ params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) redirect("/login");
  const project = await queueProject(context, (await params).key).catch(() => null);
  if (!project || !await requireProjectPermission(context, project.id, "project.admin")) notFound();
  const types = await db.serviceRequestType.findMany({ where: { projectId: project.id, archivedAt: null, publishedAt: { not: null } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return <main className="portal-page"><header><strong>{project.name}</strong><Link href={`/projects/${project.key}/queues`}>Agent queues</Link></header><h1>Service email</h1><MailboxSettings projectKey={project.key} types={types} /></main>;
}
