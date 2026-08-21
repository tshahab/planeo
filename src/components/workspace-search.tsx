"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Issue } from "@/lib/types";

type Filters = { projects: Array<{ id: string; key: string; name: string; statuses: Array<{ id: string; name: string }>; issueTypes: Array<{ id: string; name: string }> }>; members: Array<{ id: string; name: string }>; labels: Array<{ id: string; name: string }>; sprints: Array<{ id: string; name: string; projectId: string }> };
type Payload = { results: Array<Issue & { projectName: string }>; total: number; page: number; pageSize: number; filters: Filters; error?: string };

export function WorkspaceSearch({ workspaceName }: { workspaceName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const queryString = searchParams.toString();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/search?${queryString}`, { signal: controller.signal }).then(async (response) => {
      const result = await response.json() as Payload;
      if (!response.ok) throw new Error(result.error ?? "Search could not be loaded.");
      return result;
    }).then(setData).catch((cause: Error) => { if (cause.name !== "AbortError") setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [queryString]);

  function update(name: string, value: string) {
    setLoading(true);
    setError(null);
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(name, value); else next.delete(name);
    if (name !== "page") next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  }
  const selectedProject = data?.filters.projects.find((project) => project.key === searchParams.get("project"));
  const statuses = selectedProject?.statuses ?? data?.filters.projects.flatMap((project) => project.statuses) ?? [];
  const issueTypes = selectedProject?.issueTypes ?? data?.filters.projects.flatMap((project) => project.issueTypes) ?? [];
  const page = Number(searchParams.get("page") ?? 1);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));

  return <main className="workspace-search-page">
    <header><Link href="/" className="search-brand"><span>P</span> Planeo</Link><div><strong>{workspaceName}</strong><small>Workspace search</small></div></header>
    <section className="search-content">
      <div className="search-title"><div><span>Workspace</span><h1>Search issues</h1><p>Find permitted work across projects using structured filters.</p></div><SlidersHorizontal aria-hidden="true" /></div>
      <div className="workspace-search-input"><Search aria-hidden="true" /><input aria-label="Search issue key, summary, or description" defaultValue={searchParams.get("q") ?? ""} placeholder="Try WEB-12 or onboarding" onKeyDown={(event) => { if (event.key === "Enter") update("q", event.currentTarget.value.trim()); }} /><button onClick={(event) => update("q", event.currentTarget.parentElement?.querySelector("input")?.value.trim() ?? "")}>Search</button></div>
      <div className="search-filters" aria-label="Search filters">
        <Filter label="Project" value={searchParams.get("project") ?? ""} onChange={(value) => update("project", value)} options={data?.filters.projects.map((item) => [item.key, item.name]) ?? []} />
        <Filter label="Type" value={searchParams.get("type") ?? ""} onChange={(value) => update("type", value)} options={unique(issueTypes.map((item) => [item.id, item.name]))} />
        <Filter label="Status" value={searchParams.get("status") ?? ""} onChange={(value) => update("status", value)} options={unique(statuses.map((item) => [item.id, item.name]))} />
        <Filter label="Assignee" value={searchParams.get("assignee") ?? ""} onChange={(value) => update("assignee", value)} options={data?.filters.members.map((item) => [item.id, item.name]) ?? []} />
        <Filter label="Reporter" value={searchParams.get("reporter") ?? ""} onChange={(value) => update("reporter", value)} options={data?.filters.members.map((item) => [item.id, item.name]) ?? []} />
        <Filter label="Priority" value={searchParams.get("priority") ?? ""} onChange={(value) => update("priority", value)} options={[["URGENT", "Urgent"], ["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"]]} />
        <Filter label="Label" value={searchParams.get("label") ?? ""} onChange={(value) => update("label", value)} options={data?.filters.labels.map((item) => [item.id, item.name]) ?? []} />
        <Filter label="Sprint" value={searchParams.get("sprint") ?? ""} onChange={(value) => update("sprint", value)} options={data?.filters.sprints.map((item) => [item.id, item.name]) ?? []} />
        <label>Created from<input type="date" value={searchParams.get("from") ?? ""} onChange={(event) => update("from", event.target.value)} /></label>
        <label>Created to<input type="date" value={searchParams.get("to") ?? ""} onChange={(event) => update("to", event.target.value)} /></label>
        <Filter label="Sort" value={searchParams.get("sort") ?? "updated"} onChange={(value) => update("sort", value)} allLabel="Updated" options={[["created", "Created"], ["priority", "Priority"], ["due", "Due date"], ["rank", "Rank"]]} />
      </div>
      <div className="search-results-heading"><strong>{data?.total ?? 0} issues</strong>{queryString && <button onClick={() => router.replace(pathname)}>Clear filters</button>}</div>
      {loading && <div className="search-state" role="status">Loading search results…</div>}
      {error && <div className="search-state search-state-error" role="alert">{error}</div>}
      {!loading && !error && data?.results.length === 0 && <div className="search-state">No issues match these filters.</div>}
      {!loading && !error && <div className="search-result-list">{data?.results.map((issue) => <Link key={issue.id} href={`/projects/${issue.key.split("-")[0]}?issue=${issue.id}&returnTo=${encodeURIComponent(`${pathname}?${queryString}`)}`}><strong>{issue.key}</strong><span>{issue.title}<small>{issue.projectName} · {issue.status} · {issue.priority}</small></span><em>{issue.assignee?.name ?? "Unassigned"}</em></Link>)}</div>}
      {!loading && !error && data && data.total > data.pageSize && <nav className="search-pagination" aria-label="Search result pages"><button disabled={page <= 1} onClick={() => update("page", String(page - 1))}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => update("page", String(page + 1))}>Next</button></nav>}
    </section>
  </main>;
}

function Filter({ label, value, options, onChange, allLabel = "All" }: { label: string; value: string; options: string[][]; onChange: (value: string) => void; allLabel?: string }) { return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
function unique(options: string[][]) { return [...new Map(options.map((option) => [option[0], option])).values()]; }
