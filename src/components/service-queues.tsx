"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { QueueDefinition, QueueRow } from "@/lib/service-queues";

type Option = { id: string; name: string };
type Queue = { id: string; name: string; ownerId: string; visibility: string; version: number; position: number; isDefault: boolean; definition: QueueDefinition };
type Snapshot = { snapshotId: string; createdAt: string; definition: QueueDefinition; rows: QueueRow[]; metrics: { total: number; unassigned: number; aging: number; slaRisk: number; recentCustomerResponses: number; workload: Record<string, number> } };
const columns = ["summary", "status", "priority", "assignee", "requestType", "organization", "createdAt", "updatedAt", "slaState", "customerResponse"];
const initial: QueueDefinition = { filters: {}, columns: ["summary", "status", "priority", "assignee", "slaState"], grouping: "none", sort: "createdAt", direction: "asc" };
const label: Record<string, string> = { summary: "Summary", status: "Status", priority: "Priority", assignee: "Assignee", requestType: "Request type", organization: "Organization", createdAt: "Created", updatedAt: "Updated", slaState: "SLA state", customerResponse: "Latest customer response" };

export function ServiceQueues({ projectKey, userId, canAdmin, canEdit, options }: { projectKey: string; userId: string; canAdmin: boolean; canEdit: boolean; options: { statuses: Option[]; requestTypes: Option[]; people: Option[]; organizations: Option[]; labels: Option[] } }) {
  const base = `/api/projects/${projectKey}/queues`;
  const [queues, setQueues] = useState<Queue[]>([]), [queueId, setQueueId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [page, setPage] = useState(1), [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [changed, setChanged] = useState(false);
  const [editing, setEditing] = useState(false), [editId, setEditId] = useState("");
  const [name, setName] = useState("All requests"), [visibility, setVisibility] = useState("PRIVATE"), [position, setPosition] = useState(0), [isDefault, setIsDefault] = useState(false), [definition, setDefinition] = useState<QueueDefinition>(initial);
  const [actionType, setActionType] = useState("claim"), [actionValue, setActionValue] = useState("");
  const current = queues.find(queue => queue.id === queueId);

  async function json(path: string, method = "GET", body?: unknown) {
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Queue operation failed."); return result;
  }
  const loadQueues = useCallback(async () => { const response = await fetch(base); const result = await response.json(); if (!response.ok) throw new Error(result.error); setQueues(result.queues); setQueueId(id => id || result.queues[0]?.id || ""); }, [base]);
  useEffect(() => { const controller = new AbortController(); fetch(base, { signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); setQueues(result.queues); setQueueId(result.queues[0]?.id ?? ""); }).catch(error => { if (error.name !== "AbortError") setMessage(error.message); }); return () => controller.abort(); }, [base]);
  useEffect(() => {
    // Existing SSE checks current project and issue security before delivering an event.
    const source = new EventSource("/api/realtime");
    const change = () => setChanged(true);
    for (const type of ["issue.created", "issue.updated", "issue.transitioned", "reset"]) source.addEventListener(type, change);
    source.onerror = change;
    return () => source.close();
  }, []);
  async function run(task: () => Promise<void>) { setBusy(true); setMessage(""); try { await task(); } catch (error) { setMessage(error instanceof Error ? error.message : "Queue operation failed."); } finally { setBusy(false); } }
  async function refresh(id = queueId) {
    if (!id) return;
    const created = await json(`${base}/${id}/snapshot`, "POST");
    const result = await json(`${base}/${id}/snapshot?snapshot=${created.id}&page=1`);
    setSnapshot(result); setPage(1); setSelected([]); setChanged(false);
  }
  function startEditor(queue?: Queue) { setEditId(queue?.id ?? ""); setName(queue?.name ?? "All requests"); setVisibility(queue?.visibility ?? "PRIVATE"); setPosition(queue?.position ?? 0); setIsDefault(queue?.isDefault ?? false); setDefinition(queue?.definition ?? initial); setEditing(true); }
  async function save() {
    const body = { name, position, isDefault, definition, ...(editId ? { version: queues.find(queue => queue.id === editId)?.version } : { visibility }) };
    const result = await json(editId ? `${base}/${editId}` : base, editId ? "PATCH" : "POST", body);
    await loadQueues(); const id = editId || result.queue.id; setQueueId(id); setEditing(false); await refresh(id); setMessage("Queue saved.");
  }
  function filter(key: string, value: string) { setDefinition(previous => ({ ...previous, filters: { ...previous.filters, [key]: value } })); }
  function selectFilter(key: string, title: string, values: Option[]) { return <label>{title}<select value={definition.filters[key as keyof QueueDefinition["filters"]] ?? ""} onChange={event => filter(key, event.target.value)}><option value="">Any</option>{values.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>; }
  async function apply() {
    if (!snapshot) return;
    const action = actionType === "claim" ? { claim: true } : actionType === "unassign" ? { assigneeId: null } : { [actionType]: actionType === "participantIds" ? actionValue.split(",").map(value => value.trim()).filter(Boolean) : actionValue };
    const result = await json(`${base}/${queueId}/actions`, "POST", { snapshotId: snapshot.snapshotId, ids: selected, action });
    await refresh(); setMessage(`${result.updated} request(s) updated.`);
  }
  async function paginate(next: number) { const result = await json(`${base}/${queueId}/snapshot?snapshot=${snapshot!.snapshotId}&page=${next}`); setSnapshot(result); setPage(next); setSelected([]); }
  const groups = snapshot ? Object.groupBy(snapshot.rows, row => snapshot.definition.grouping === "none" ? "Requests" : String(row[snapshot.definition.grouping as keyof QueueRow] ?? "None")) : {};

  return <section aria-label="Service queues" className="service-queues">
    <div className="queue-toolbar"><label>Queue<select value={queueId} onChange={event => { setQueueId(event.target.value); setSnapshot(null); setSelected([]); }}><option value="">Select a queue</option>{queues.map(queue => <option key={queue.id} value={queue.id}>{queue.name} · {queue.visibility === "TEAM" ? "Team" : "Personal"}{queue.isDefault ? " · Default" : ""}</option>)}</select></label><button disabled={busy || !queueId} onClick={() => void run(() => refresh())}>Refresh queue</button><button onClick={() => startEditor()}>New queue</button>{current && (current.visibility === "TEAM" ? canAdmin : current.ownerId === userId) && <button onClick={() => startEditor(current)}>Edit queue</button>}</div>
    <p role="status" aria-live="polite">{message || (changed ? "Updates are available. Refresh to review current data." : "Queue snapshots remain valid for five minutes unless data or access changes.")}</p>
    {editing && <form className="queue-editor" onSubmit={event => { event.preventDefault(); void run(save); }}><h2>{editId ? "Edit queue" : "New queue"}</h2><label>Queue name<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label><label>Visibility<select disabled={Boolean(editId)} value={visibility} onChange={event => setVisibility(event.target.value)}><option value="PRIVATE">Personal</option>{canAdmin && <option value="TEAM">Team</option>}</select></label><label>Queue order<input type="number" min={0} max={10000} value={position} onChange={event => setPosition(Number(event.target.value))} /></label><label><input type="checkbox" checked={isDefault} onChange={event => setIsDefault(event.target.checked)} /> Default view</label>
      <fieldset><legend>Filters</legend>{selectFilter("status", "Status filter", options.statuses)}{selectFilter("requestType", "Request type filter", options.requestTypes)}{selectFilter("priority", "Priority filter", ["URGENT", "HIGH", "MEDIUM", "LOW"].map(id => ({ id, name: id })))}{selectFilter("assignee", "Assignee filter", [{ id: "unassigned", name: "Unassigned" }, ...options.people])}{selectFilter("organization", "Organization filter", options.organizations)}{selectFilter("label", "Label filter", options.labels)}{selectFilter("slaState", "SLA state filter", ["NONE", "RUNNING", "PAUSED", "AT_RISK", "BREACHED", "MET"].map(id => ({ id, name: id })))}<label>Created from<input type="date" value={definition.filters.from ?? ""} onChange={event => filter("from", event.target.value)} /></label><label>Created through<input type="date" value={definition.filters.to ?? ""} onChange={event => filter("to", event.target.value)} /></label></fieldset>
      <fieldset><legend>Columns</legend>{columns.map(column => <label key={column}><input type="checkbox" checked={definition.columns.includes(column)} onChange={event => setDefinition({ ...definition, columns: event.target.checked ? [...definition.columns, column] : definition.columns.filter(value => value !== column) })} />{label[column]}</label>)}</fieldset>
      <label>Group by<select value={definition.grouping} onChange={event => setDefinition({ ...definition, grouping: event.target.value })}>{["none", "status", "priority", "assignee", "requestType", "organization", "slaState"].map(value => <option key={value} value={value}>{label[value] ?? "No grouping"}</option>)}</select></label><label>Sort by<select value={definition.sort} onChange={event => setDefinition({ ...definition, sort: event.target.value })}>{["createdAt", "updatedAt", "priority", "summary"].map(value => <option key={value} value={value}>{label[value]}</option>)}</select></label><label>Sort direction<select value={definition.direction} onChange={event => setDefinition({ ...definition, direction: event.target.value as "asc" | "desc" })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><button disabled={busy}>Save queue</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></form>}
    {snapshot && <><h2>{current?.name}</h2><p>Snapshot: {new Date(snapshot.createdAt).toLocaleString()}</p><dl className="queue-metrics">{Object.entries({ Requests: snapshot.metrics.total, Unassigned: snapshot.metrics.unassigned, "Older than 7 days": snapshot.metrics.aging, "SLA at risk / breached": snapshot.metrics.slaRisk, "Customer responses in 24 hours": snapshot.metrics.recentCustomerResponses }).map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl><details><summary>Agent workload in this queue</summary><ul>{Object.entries(snapshot.metrics.workload).map(([person, count]) => <li key={person}>{person}: {count}</li>)}</ul></details>
      {canEdit && <div className="queue-toolbar"><label>Bulk action<select value={actionType} onChange={event => { setActionType(event.target.value); setActionValue(""); }}>{[["claim", "Claim"], ["assigneeId", "Assign"], ["unassign", "Unassign"], ["priority", "Priority"], ["statusId", "Status"], ["requestTypeId", "Request type"], ["participantIds", "Participants"]].map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>{!["claim", "unassign"].includes(actionType) && (actionType === "participantIds" ? <label>Participant customer IDs (comma-separated)<input value={actionValue} onChange={event => setActionValue(event.target.value)} /></label> : <label>Action value<select value={actionValue} onChange={event => setActionValue(event.target.value)}><option value="">Select a value</option>{(actionType === "assigneeId" ? options.people : actionType === "statusId" ? options.statuses : actionType === "requestTypeId" ? options.requestTypes : ["URGENT", "HIGH", "MEDIUM", "LOW"].map(id => ({ id, name: id }))).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>)}<button disabled={busy || !selected.length} onClick={() => void run(apply)}>Apply to {selected.length} selected</button></div>}
      {!snapshot.rows.length && <p>No requests match this queue.</p>}{Object.entries(groups).map(([group, rows]) => <section key={group}><h3>{group}</h3><div className="queue-table" tabIndex={0} role="region" aria-label={`${group} requests`}><table><thead><tr>{canEdit && <th scope="col">Select</th>}{snapshot.definition.columns.map(column => <th scope="col" key={column}>{label[column]}</th>)}</tr></thead><tbody>{rows?.map(row => <tr key={row.id}>{canEdit && <td><input type="checkbox" aria-label={`Select ${projectKey}-${row.number}`} checked={selected.includes(row.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id))} /></td>}{snapshot.definition.columns.map(column => <td key={column}>{column === "summary" ? <Link href={`/projects/${projectKey}?issue=${row.id}`}>{projectKey}-{row.number}: {row.summary}</Link> : String(row[column as keyof QueueRow] ?? "—")}</td>)}</tr>)}</tbody></table></div></section>)}<nav aria-label="Queue pages"><button disabled={busy || page === 1} onClick={() => void run(() => paginate(page - 1))}>Previous</button><span> Page {page} of {Math.max(1, Math.ceil(snapshot.metrics.total / 25))} </span><button disabled={busy || page * 25 >= snapshot.metrics.total} onClick={() => void run(() => paginate(page + 1))}>Next</button></nav></>}
  </section>;
}
