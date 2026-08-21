import { Bell, CalendarClock, CheckCircle2, Clock3, FolderKanban } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleProjectWhere, listAccessibleProjects } from "@/lib/project-query";

export default async function Home({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const context = await getAuthContext(); if (!context) redirect("/login");
  const projects = await listAccessibleProjects(context); const requested = (await searchParams).project;
  const selected = requested ? projects.find((project) => project.key === requested.toUpperCase()) : undefined;
  const issueScope = { workspaceId: context.workspace.id, archivedAt: null, parentId: null, project: { is: { ...accessibleProjectWhere(context), ...(selected ? { id: selected.id } : {}) } } };
  const today = new Date();
  const [assigned, overdue, assignedCount, overdueCount, unread, recent] = await Promise.all([
    db.issue.findMany({ where: { ...issueScope, assigneeId: context.user.id, status: { category: { not: "DONE" } } }, include: { project: { select: { key: true, name: true } }, status: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.issue.findMany({ where: { ...issueScope, dueDate: { lt: today }, status: { category: { not: "DONE" } } }, include: { project: { select: { key: true, name: true } }, assignee: { select: { name: true } } }, orderBy: { dueDate: "asc" }, take: 8 }),
    db.issue.count({ where: { ...issueScope, assigneeId: context.user.id, status: { category: { not: "DONE" } } } }),
    db.issue.count({ where: { ...issueScope, dueDate: { lt: today }, status: { category: { not: "DONE" } } } }),
    db.notification.count({ where: { workspaceId: context.workspace.id, userId: context.user.id, readAt: null, issue: { is: issueScope } } }),
    db.recentIssueView.findMany({ where: { workspaceId: context.workspace.id, userId: context.user.id, issue: issueScope }, include: { issue: { include: { project: { select: { key: true, name: true } }, status: { select: { name: true } } } } }, orderBy: { viewedAt: "desc" }, take: 8 }),
  ]);
  return <main className="dashboard-page">
    <header><div className="dashboard-brand"><span>P</span><strong>Planeo</strong></div><div><strong>{context.workspace.name}</strong><small>Personal dashboard</small></div><Link href="/notifications" aria-label={`${unread} unread notifications`}><Bell />{unread > 0 && <b>{unread}</b>}</Link></header>
    <section className="dashboard-content">
      <div className="dashboard-welcome"><div><span>Welcome back</span><h1>{context.user.name}</h1><p>Here’s what needs your attention across the workspace.</p></div><form><label htmlFor="dashboard-project">Project</label><select id="dashboard-project" name="project" defaultValue={selected?.key ?? ""}><option value="">All accessible projects</option>{projects.map((project) => <option key={project.id} value={project.key}>{project.name}</option>)}</select><button>Apply</button></form></div>
      <div className="dashboard-metrics"><Link href={`/search?assignee=${context.user.id}`}><CheckCircle2 /><span><strong>{assignedCount}</strong>Assigned open issues</span></Link><Link href="/search?overdue=true"><CalendarClock /><span><strong>{overdueCount}</strong>Overdue issues</span></Link><Link href="/notifications"><Bell /><span><strong>{unread}</strong>Unread notifications</span></Link><span><FolderKanban /><span><strong>{projects.length}</strong>Accessible projects</span></span></div>
      <div className="dashboard-grid"><DashboardList title="Assigned to you" empty="No assigned open issues." items={assigned.map((issue) => ({ id: issue.id, key: `${issue.project.key}-${issue.number}`, title: issue.summary, meta: `${issue.project.name} · ${issue.status.name}` }))} /><DashboardList title="Overdue" empty="No overdue issues." items={overdue.map((issue) => ({ id: issue.id, key: `${issue.project.key}-${issue.number}`, title: issue.summary, meta: `${issue.assignee?.name ?? "Unassigned"} · Due ${issue.dueDate?.toLocaleDateString()}` }))} /><DashboardList title="Recently viewed" empty="Open an issue to see it here." items={recent.map(({ issue, viewedAt }) => ({ id: issue.id, key: `${issue.project.key}-${issue.number}`, title: issue.summary, meta: `${issue.status.name} · Viewed ${viewedAt.toLocaleDateString()}` }))} wide /></div>
    </section>
  </main>;
}

function DashboardList({ title, empty, items, wide = false }: { title: string; empty: string; items: Array<{ id: string; key: string; title: string; meta: string }>; wide?: boolean }) { return <section className={`dashboard-list ${wide ? "wide" : ""}`}><header><h2>{title}</h2><Clock3 /></header>{items.length === 0 ? <p>{empty}</p> : items.map((item) => <Link key={item.id} href={`/projects/${item.key.split("-")[0]}?issue=${item.id}&returnTo=/`}><strong>{item.key}</strong><span>{item.title}<small>{item.meta}</small></span></Link>)}</section>; }
