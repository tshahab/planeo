import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getProjectForContext } from "@/lib/issue-query";
import { ReleasePlanner } from "@/components/release-planner";

export default async function ReleasesPage({ params }: { params: Promise<{ key: string }> }) {
  const context = await getAuthContext(); if (!context) redirect("/login");
  const project = await getProjectForContext(context, (await params).key).catch(() => null); if (!project) redirect("/");
  return <ReleasePlanner projectKey={project.key} projectName={project.name} />;
}
