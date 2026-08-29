"use client";

import {
  Bell, ChevronDown, CircleHelp, FolderKanban, Inbox, LayoutDashboard,
  ListFilter, Menu, MoreHorizontal, Plus, Search, Settings, Sparkles, Users, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Board } from "./board";
import { CreateIssue } from "./create-issue";
import { CreateProject } from "./create-project";
import { ProjectMembers } from "./project-members";
import { IssuePanel } from "./issue-panel";
import { Backlog } from "./backlog";
import { ProjectSummary as ProjectSummaryView } from "./project-summary";
import type { Issue, Person, ProjectIssueType, ProjectStatus, ProjectSummary, Status } from "@/lib/types";

export function WorkspaceApp({ currentUser, workspaceName, project, projects, statuses, issueTypes, projectPeople, activeSprint, canManageProjects, canManageProject, canWriteProject }: { currentUser: Person; workspaceName: string; project: ProjectSummary; projects: ProjectSummary[]; statuses: ProjectStatus[]; issueTypes: ProjectIssueType[]; projectPeople: Person[]; activeSprint: { id: string; name: string; endsAt?: string } | null; canManageProjects: boolean; canManageProject: boolean; canWriteProject: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [managingMembers, setManagingMembers] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | "Mine">("All");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [view, setView] = useState<"summary" | "board" | "backlog">("summary");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [customFields, setCustomFields] = useState<Array<{ required: boolean; issueTypeIds: unknown; field: { id: string; name: string; type: string; options: unknown; defaultValue: unknown } }>>([]);
  const createTrigger = useRef<HTMLElement | null>(null);

  function openCreate() {
    createTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCreating(true);
  }

  function closeCreate() {
    setCreating(false);
    requestAnimationFrame(() => createTrigger.current?.focus());
  }

  useEffect(() => { const controller = new AbortController(); fetch("/api/notifications?page=1", { signal: controller.signal }).then((response) => response.ok ? response.json() : { unread: 0 }).then((result: { unread: number }) => setUnreadNotifications(result.unread)).catch(() => undefined); return () => controller.abort(); }, []);
  useEffect(() => { const controller = new AbortController(); fetch(`/api/projects/${project.key}/custom-fields`, { signal: controller.signal }).then((response) => response.ok ? response.json() : { fields: [] }).then((result: { fields?: typeof customFields }) => setCustomFields(result.fields ?? [])).catch(() => undefined); return () => controller.abort(); }, [project.key]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/issues?projectKey=${encodeURIComponent(project.key)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load issues from the database.");
        return response.json() as Promise<{ issues: Issue[] }>;
      })
      .then(({ issues: persistedIssues }) => {
        setIssues(persistedIssues);
        const requestedIssue = searchParams.get("issue");
        if (requestedIssue) setSelectedIssue(persistedIssues.find((issue) => issue.id === requestedIssue) ?? null);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setSyncError(error.message);
      });
    return () => controller.abort();
  }, [project.key, searchParams]);

  function closeIssue() {
    setSelectedIssue(null);
    const returnTo = searchParams.get("returnTo");
    if (returnTo === "/" || returnTo === "/notifications" || returnTo?.startsWith("/search")) router.push(returnTo);
  }

  const visibleIssues = useMemo(() => issues.filter((issue) => {
    const matchesQuery = `${issue.key} ${issue.title} ${issue.labels.join(" ")}`.toLowerCase().includes(query.toLowerCase());
    const matchesOwner = filter === "All" || issue.assignee?.id === currentUser.id;
    return matchesQuery && matchesOwner;
  }), [issues, query, filter, currentUser.id]);

  async function moveIssue(id: string, status: Status) {
    const previous = issues.find((issue) => issue.id === id);
    setIssues((current) => current.map((issue) => issue.id === id ? { ...issue, status } : issue));
    setSelectedIssue((current) => current?.id === id ? { ...current, status } : current);
    setSyncError(null);
    try {
      const response = await fetch(`/api/issues/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error("The status change could not be saved.");
      const { issue } = await response.json() as { issue: Issue };
      setIssues((current) => current.map((item) => item.id === id ? issue : item));
      setSelectedIssue((current) => current?.id === id ? issue : current);
    } catch (error) {
      if (previous) {
        setIssues((current) => current.map((item) => item.id === id ? previous : item));
        setSelectedIssue((current) => current?.id === id ? previous : current);
      }
      setSyncError(error instanceof Error ? error.message : "The status change could not be saved.");
    }
  }

  async function updateIssue(id: string, changes: Record<string, unknown>) {
    const response = await fetch(`/api/issues/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    const result = await response.json() as { issue?: Issue; error?: string };
    if (!response.ok || !result.issue) throw new Error(result.error ?? "The issue changes could not be saved.");
    setIssues((current) => current.map((item) => item.id === id ? result.issue! : item));
    setSelectedIssue((current) => current?.id === id ? result.issue! : current);
  }

  async function addIssue(draft: Issue) {
    setSyncError(null);
    try {
      const response = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectKey: project.key, title: draft.title, description: draft.description, priority: draft.priority, assigneeId: draft.assignee?.id, issueTypeId: draft.issueTypeId, customFields: Object.fromEntries(Object.entries(draft.customFields ?? {}).map(([id, field]) => [id, field.value])) }),
      });
      const result = await response.json() as { issue?: Issue; error?: string };
      if (!response.ok || !result.issue) throw new Error(result.error ?? "The issue could not be created.");
      setIssues((current) => [result.issue!, ...current]);
      closeCreate();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "The issue could not be created.");
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="workspace-switcher">
          <div className="brand-mark">P</div>
          <div><strong>{workspaceName}</strong><span>Product workspace</span></div>
          <ChevronDown size={15} />
          <button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>

        {canWriteProject && <button className="create-button" onClick={openCreate}><Plus size={17} /> Create issue <kbd>C</kbd></button>}

        <nav aria-label="Main navigation">
          <Link href="/" className="nav-item"><LayoutDashboard /> Home</Link>
          <a href="#" className="nav-item"><Inbox /> Your work <span className="nav-count">5</span></a>
          <Link href="/search" className="nav-item"><Search /> Search</Link>
          <Link href="/notifications" className="nav-item"><Bell /> Notifications {unreadNotifications > 0 && <span className="nav-count">{unreadNotifications}</span>}</Link>
        </nav>

        <div className="nav-section">
          <div className="nav-heading"><span>Projects</span>{canManageProjects && <button onClick={() => setCreatingProject(true)} aria-label="Create project"><Plus size={14} /></button>}</div>
          {projects.map((item, index) => <Link href={`/projects/${item.key}`} key={item.id} className={`project-item ${item.id === project.id ? "active" : ""}`}><span className={`project-icon ${["purple", "green", "orange"][index % 3]}`}>{item.name[0]}</span><span>{item.name}<small>{item.key}</small></span>{item.id === project.id && <MoreHorizontal size={15} />}</Link>)}
        </div>

        <div className="sidebar-footer">
          {canManageProjects && <><Link href="/settings/workspace" className="nav-item"><Users /> Workspace admin</Link><Link href="/settings/audit" className="nav-item"><ListFilter /> Audit log</Link></>}
          <a href="#" className="nav-item"><CircleHelp /> Help & feedback</a>
          <Link href="/settings/profile" className="nav-item"><Settings /> Settings</Link>
          <div className="user-card"><Avatar person={currentUser} /><div><strong>{currentUser.name}</strong><span>Signed in</span></div><button className="logout-button" aria-label="Sign out" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }}><MoreHorizontal size={16} /></button></div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Projects</span><span>/</span><strong>{project.name}</strong></div>
          <div className="top-actions"><Link href="/notifications" className="icon-button" aria-label={`${unreadNotifications} unread notifications`}><Bell size={18} />{unreadNotifications > 0 && <i />}</Link><Avatar person={currentUser} /></div>
        </header>

        <section className="project-header">
          <div className="project-title-row">
            <div><span className="eyebrow">{project.key} PROJECT</span><h1>{project.name}</h1><p>{project.description || "Plan and deliver your team's work."}</p></div>
            <div className="header-actions"><div className="avatar-stack">{projectPeople.slice(0, 4).map((person) => <Avatar key={person.id} person={person} />)}{projectPeople.length > 4 && <span className="more-people">+{projectPeople.length - 4}</span>}</div>{canManageProject && <><button className="secondary-button" onClick={() => setManagingMembers(true)}><Users size={16} /> Members</button><Link className="secondary-button" href={`/projects/${project.key}/settings/workflow`}><Settings size={16} /> Workflow</Link></>}{canWriteProject && <button className="primary-button" onClick={openCreate}><Plus size={17} /> Create</button>}</div>
          </div>
          <div className="tabs" role="tablist"><button role="tab" aria-selected={view === "summary"} className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}>Summary</button><button role="tab" aria-selected={view === "board"} className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Board</button><button role="tab" aria-selected={view === "backlog"} className={view === "backlog" ? "active" : ""} onClick={() => setView("backlog")}>Backlog</button><Link role="tab" aria-selected={false} href={`/projects/${project.key}/reports`}>Reports</Link><Link role="tab" aria-selected={false} href={`/projects/${project.key}/releases`}>Releases</Link><button role="tab" aria-selected={false}>Issues</button></div>
        </section>

        {view === "board" && <><section className="board-toolbar">
          <div className="search-box"><Search size={17} /><input aria-label="Search this board" placeholder="Search this board" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}</div>
          <button className={`filter-button ${filter === "Mine" ? "filter-active" : ""}`} onClick={() => setFilter((value) => value === "All" ? "Mine" : "All")}><ListFilter size={16} /> {filter === "Mine" ? "Assigned to me" : "Filter"}</button>
          <div className="toolbar-divider" />
          <button className="view-button"><FolderKanban size={16} /> Board <ChevronDown size={14} /></button>
          {project.template === "SCRUM" && activeSprint && <div className="sprint-chip"><Sparkles size={14} /><span>{activeSprint.name}</span>{activeSprint.endsAt && <strong>Ends {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(activeSprint.endsAt))}</strong>}</div>}
        </section>

        <Board issues={visibleIssues} statuses={statuses} onSelect={setSelectedIssue} onMove={moveIssue} onCreate={openCreate} readOnly={!canWriteProject} /></>}
        {view === "summary" && <ProjectSummaryView projectKey={project.key} />}
        {view === "backlog" && <Backlog projectKey={project.key} canWrite={canWriteProject} onSelect={setSelectedIssue} />}
      </main>

      {selectedIssue && <IssuePanel issue={selectedIssue} statuses={statuses} currentUser={currentUser} onClose={closeIssue} onMove={(status) => moveIssue(selectedIssue.id, status)} onUpdate={(changes) => updateIssue(selectedIssue.id, changes)} onArchive={canManageProject ? async () => { const response = await fetch(`/api/issues/${selectedIssue.id}/archive`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive" }) }); if (!response.ok) throw new Error("Issue could not be archived."); setIssues((current) => current.filter((item) => item.id !== selectedIssue.id)); setSelectedIssue(null); } : undefined} readOnly={!canWriteProject} />}
      {creating && <CreateIssue project={project} people={projectPeople} issueTypes={issueTypes} statuses={statuses} customFields={customFields} nextNumber={issues.length + 1} onClose={closeCreate} onCreate={addIssue} />}
      {creatingProject && <CreateProject onClose={() => setCreatingProject(false)} />}
      {managingMembers && <ProjectMembers projectKey={project.key} projectName={project.name} onClose={() => setManagingMembers(false)} />}
      {syncError && <div className="sync-error" role="alert"><span>{syncError}</span><button onClick={() => setSyncError(null)} aria-label="Dismiss error"><X size={15} /></button></div>}
    </div>
  );
}

export function Avatar({ person }: { person: { name: string; initials: string; color: string } }) {
  return <span className="avatar" style={{ background: person.color }} title={person.name}>{person.initials}</span>;
}
