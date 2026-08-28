import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getProjectForContext } from "@/lib/issue-query";
import { DeliveryReports } from "@/components/delivery-reports";
export default async function ReportsPage({ params }: { params: Promise<{ key: string }> }) { const context = await getAuthContext(); if (!context) redirect("/login"); const { key } = await params; const project = await getProjectForContext(context, key).catch(() => null); if (!project) notFound(); return <main className="reports-shell"><header><a href={`/projects/${project.key}`}>← {project.name}</a><strong>Delivery insights</strong></header><DeliveryReports projectKey={project.key}/></main>; }
