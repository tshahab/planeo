import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { queueProject } from "@/lib/service-queues";
import { requireProjectPermission } from "@/lib/permissions";
import { SlaSettings } from "@/components/sla-settings";
export default async function SlaPage({ params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) redirect("/login");
  const project = await queueProject(context, (await params).key).catch(() => null);
  if (!project || !await requireProjectPermission(context, project.id, "project.admin")) notFound();
  return <main className="portal-page"><header><strong>{project.name}</strong><nav><Link href={`/projects/${project.key}/queues`}>Agent queues</Link></nav></header><h1>Service level targets</h1><SlaSettings projectKey={project.key} /></main>;
}
