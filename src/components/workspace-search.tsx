"use client";

import { Bookmark, Search, Share2, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Issue } from "@/lib/types";

type Filters = { projects: Array<{ id: string; key: string; name: string; statuses: Array<{ id: string; name: string }>; issueTypes: Array<{ id: string; name: string }> }>; members: Array<{ id: string; name: string }>; labels: Array<{ id: string; name: string }>; sprints: Array<{ id: string; name: string; projectId: string }> };
type Payload = { results: Array<Issue & { projectName: string }>; total: number; page: number; pageSize: number; filters: Filters; error?: string };
type SavedFilter = { id: string; name: string; query: Record<string, string>; shared: boolean; ownerId: string; owner: { name: string } };

export function WorkspaceSearch({ workspaceName, currentUserId }: { workspaceName: string; currentUserId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [saveName, setSaveName] = useState("");
  const [shareNew, setShareNew] = useState(false);
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

  useEffect(() => { const controller = new AbortController(); fetch("/api/saved-filters", { signal: controller.signal }).then((response) => response.ok ? response.json() : { filters: [] }).then((result: { filters: SavedFilter[] }) => setSavedFilters(result.filters)).catch(() => undefined); return () => controller.abort(); }, []);

  function update(name: string, value: string) {
    setLoading(true);
    setError(null);
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(name, value); else next.delete(name);
    if (name !== "page") next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  }
  function activeQuery() { const result: Record<string, string> = {}; searchParams.forEach((value, key) => { if (key !== "page") result[key] = value; }); return result; }
  async function saveFilter() { if (!saveName.trim()) return; const response = await fetch("/api/saved-filters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: saveName.trim(), query: activeQuery(), shared: shareNew }) }); const result = await response.json() as { filter?: SavedFilter; error?: string }; if (!response.ok || !result.filter) return setError(result.error ?? "Filter could not be saved."); setSavedFilters((items) => [...items, result.filter!]); setSaveName(""); setShareNew(false); }
  function applyFilter(filter: SavedFilter) { const params = new URLSearchParams(filter.query); setLoading(true); router.replace(`${pathname}?${params.toString()}`); }
  async function changeFilter(filter: SavedFilter, changes: Record<string, unknown>) { const response = await fetch(`/api/saved-filters/${filter.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }); const result = await response.json() as { filter?: SavedFilter; error?: string }; if (!response.ok || !result.filter) return setError(result.error ?? "Filter could not be updated."); setSavedFilters((items) => items.map((item) => item.id === filter.id ? result.filter! : item)); }
  async function deleteFilter(filter: SavedFilter) { const response = await fetch(`/api/saved-filters/${filter.id}`, { method: "DELETE" }); if (!response.ok) return setError("Filter could not be deleted."); setSavedFilters((items) => items.filter((item) => item.id !== filter.id)); }
  const selectedProject = data?.filters.projects.find((project) => project.key === searchParams.get("project"));
  const statuses = selectedProject?.statuses ?? data?.filters.projects.flatMap((project) => project.statuses) ?? [];
  const issueTypes = selectedProject?.issueTypes ?? data?.filters.projects.flatMap((project) => project.issueTypes) ?? [];
  const page = Number(searchParams.get("page") ?? 1);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));

  return <main className="workspace-search-page">
    <header><Link href="/" className="search-brand"><span>P</span> Planeo</Link><div><strong>{workspaceName}</strong><small>Workspace search</small></div></header>
    <section className="search-content">
      <div className="search-title"><div><span>Workspace</span><h1>Search issues</h1><p>Find permitted work across projects using structured filters.</p></div><SlidersHorizontal aria-hidden="true" /></div>
      <section className="saved-filter-panel" aria-label="Saved filters"><div className="saved-filter-create"><Bookmark /><input aria-label="Saved filter name" value={saveName} maxLength={80} placeholder="Name this search" onChange={(event) => setSaveName(event.target.value)} /><label><input type="checkbox" checked={shareNew} onChange={(event) => setShareNew(event.target.checked)} /> Share with workspace</label><button disabled={!saveName.trim()} onClick={() => void saveFilter()}>Save filter</button></div>{savedFilters.length > 0 && <div className="saved-filter-list">{savedFilters.map((filter) => <div key={filter.id}><button className="saved-filter-name" onClick={() => applyFilter(filter)}><Bookmark />{filter.name}<small>{filter.shared ? `Shared by ${filter.owner.name}` : "Private"}</small></button>{filter.ownerId === currentUserId && <><button aria-label={`${filter.shared ? "Unshare" : "Share"} ${filter.name}`} onClick={() => void changeFilter(filter, { shared: !filter.shared })}><Share2 /></button><button aria-label={`Rename ${filter.name}`} onClick={() => { const name = window.prompt("Rename saved filter", filter.name); if (name?.trim()) void changeFilter(filter, { name: name.trim() }); }}>Rename</button><button aria-label={`Delete ${filter.name}`} onClick={() => void deleteFilter(filter)}><Trash2 /></button></>}</div>)}</div>}</section>
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
