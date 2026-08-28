"use client";

import { ArrowDown, ArrowUp, CheckCircle2, Play, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Issue, SprintSummary } from "@/lib/types";

export function Backlog({ projectKey, canWrite, onSelect }: { projectKey: string; canWrite: boolean; onSelect: (issue: Issue) => void }) {
  const [backlog, setBacklog] = useState<Issue[]>([]);
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectKey)}/sprints`);
    const result = await response.json() as { backlog?: Issue[]; sprints?: SprintSummary[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Could not load the backlog.");
    setBacklog(result.backlog ?? []); setSprints(result.sprints ?? []);
  }, [projectKey]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/${encodeURIComponent(projectKey)}/sprints`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { backlog?: Issue[]; sprints?: SprintSummary[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load the backlog.");
        return result;
      })
      .then((result) => { setBacklog(result.backlog ?? []); setSprints(result.sprints ?? []); })
      .catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [projectKey]);

  async function request(url: string, body: object) {
    setError(null);
    const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "The change could not be saved.");
    await load();
  }
  async function createSprint(event: React.FormEvent) {
    event.preventDefault(); if (!name.trim()) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(projectKey)}/sprints`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setError(result.error ?? "The sprint could not be created.");
    setName(""); await load();
  }
  async function moveBacklog(index: number, delta: number) {
    const next = [...backlog]; const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; setBacklog(next);
    try { await request(`/api/projects/${encodeURIComponent(projectKey)}/backlog`, { issueIds: next.map((issue) => issue.id) }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not reorder backlog."); await load(); }
  }
  const planned = sprints.filter((sprint) => sprint.state === "PLANNED");
  const active = sprints.find((sprint) => sprint.state === "ACTIVE");
  const completed = sprints.filter((sprint) => sprint.state === "COMPLETED");
  const sprintUrl = (id: string) => `/api/projects/${encodeURIComponent(projectKey)}/sprints/${id}`;

  return <section className="backlog-view">
    <div className="backlog-heading"><div><h2>Backlog & sprints</h2><p>Prioritize upcoming work and plan delivery.</p></div>{canWrite && <form onSubmit={createSprint} className="sprint-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Sprint name" maxLength={100}/><button className="primary-button"><Plus size={16}/> Create sprint</button></form>}</div>
    {error && <div className="backlog-error">{error}</div>}
    {active && <SprintSection sprint={active} canWrite={canWrite} backlog={backlog} onSelect={onSelect} onAction={(body) => request(sprintUrl(active.id), { ...body, version: active.version }).catch((reason: Error) => setError(reason.message))} />}
    {planned.map((sprint) => <SprintSection key={sprint.id} sprint={sprint} canWrite={canWrite} backlog={backlog} onSelect={onSelect} onAction={(body) => request(sprintUrl(sprint.id), { ...body, version: sprint.version }).catch((reason: Error) => setError(reason.message))} />)}
    <section className="sprint-section"><header><div><h3>Backlog</h3><span>{backlog.length} issues</span></div></header><div className="backlog-list">{backlog.map((issue, index) => <div className="backlog-row" key={issue.id}><div className="order-buttons">{canWrite && <><button onClick={() => moveBacklog(index, -1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={14}/></button><button onClick={() => moveBacklog(index, 1)} disabled={index === backlog.length - 1} aria-label="Move down"><ArrowDown size={14}/></button></>}</div><button className="issue-link" onClick={() => onSelect(issue)}><strong>{issue.key}</strong><span>{issue.title}</span><em>{issue.priority}</em></button>{canWrite && planned.length > 0 && <select aria-label={`Assign ${issue.key} to sprint`} defaultValue="" onChange={(event) => { const sprint = planned.find((value) => value.id === event.target.value); if (sprint) request(sprintUrl(sprint.id), { action: "add", issueId: issue.id, version: sprint.version }).catch((reason: Error) => setError(reason.message)); }}><option value="">Add to sprint…</option>{planned.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select>}</div>)}{backlog.length === 0 && <p className="empty-backlog">Everything is planned.</p>}</div></section>
    {completed.length > 0 && <section className="completed-sprints"><h3>Completed sprints</h3>{completed.map((sprint) => <div key={sprint.id}><CheckCircle2 size={16}/><strong>{sprint.name}</strong><span>{sprint.completedIssueCount ?? 0} of {sprint.totalIssueCount ?? sprint.issues.length} completed</span><time>{sprint.completedAt ? new Date(sprint.completedAt).toLocaleDateString() : ""}</time></div>)}</section>}
  </section>;
}

function SprintSection({ sprint, backlog, canWrite, onSelect, onAction }: { sprint: SprintSummary; backlog: Issue[]; canWrite: boolean; onSelect: (issue: Issue) => void; onAction: (body: object) => Promise<void> }) {
  const done = sprint.issues.filter((issue) => issue.status === "Done").length;
  const estimate = sprint.estimateTotal ?? sprint.issues.reduce((sum, issue) => sum + (issue.points ?? 0), 0); const overCapacity = sprint.capacityTarget != null && estimate > sprint.capacityTarget;
  return <section className={`sprint-section ${sprint.state === "ACTIVE" ? "active-sprint" : ""}`}><header><div><h3>{sprint.name}</h3><span>{sprint.state === "ACTIVE" ? `${done}/${sprint.issues.length} done` : `${sprint.issues.length} issues`} · {estimate} points{sprint.capacityTarget != null ? ` / ${sprint.capacityTarget} capacity` : ""}</span>{sprint.startsAt && <small>{new Date(sprint.startsAt).toLocaleDateString()} – {sprint.endsAt ? new Date(sprint.endsAt).toLocaleDateString() : "open"}</small>}{overCapacity && <strong className="backlog-error">Capacity exceeded by {estimate - sprint.capacityTarget!} points</strong>}</div>{canWrite && <div>{sprint.state === "PLANNED" && <><button aria-label={`Move ${sprint.name} earlier`} onClick={() => onAction({ action: "move", direction: "up" })}><ArrowUp size={14}/></button><button aria-label={`Move ${sprint.name} later`} onClick={() => onAction({ action: "move", direction: "down" })}><ArrowDown size={14}/></button><button className="secondary-button" onClick={() => onAction({ action: "start" })}><Play size={15}/> Start sprint</button></>}{sprint.state === "ACTIVE" && <button className="secondary-button" onClick={() => onAction({ action: "complete", destination: "backlog" })}><CheckCircle2 size={15}/> Complete sprint</button>}</div>}</header>{sprint.state === "ACTIVE" && <div className="progress-track"><span style={{ width: `${sprint.issues.length ? done / sprint.issues.length * 100 : 0}%` }}/></div>}<div className="backlog-list">{sprint.issues.map((issue, index) => <div className="backlog-row" key={issue.id}>{canWrite && <div className="order-buttons"><button disabled={index === 0} aria-label={`Move ${issue.key} up`} onClick={() => { const ids = sprint.issues.map((value) => value.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; void onAction({ action: "reorder", issueIds: ids }); }}><ArrowUp size={14}/></button><button disabled={index === sprint.issues.length - 1} aria-label={`Move ${issue.key} down`} onClick={() => { const ids = sprint.issues.map((value) => value.id); [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; void onAction({ action: "reorder", issueIds: ids }); }}><ArrowDown size={14}/></button></div>}<button className="issue-link" onClick={() => onSelect(issue)}><strong>{issue.key}</strong><span>{issue.title}</span><em>{issue.status}</em></button>{canWrite && <button className="remove-sprint" onClick={() => onAction({ action: "remove", issueId: issue.id })}><RotateCcw size={14}/> Backlog</button>}</div>)}{sprint.issues.length === 0 && <p className="empty-backlog">Add issues from the backlog below.</p>}</div>{canWrite && backlog.length > 0 && sprint.state === "ACTIVE" && <select className="active-add" defaultValue="" onChange={(event) => { if (event.target.value) onAction({ action: "add", issueId: event.target.value }); }}><option value="">Add an issue…</option>{backlog.map((issue) => <option key={issue.id} value={issue.id}>{issue.key} · {issue.title}</option>)}</select>}</section>;
}
