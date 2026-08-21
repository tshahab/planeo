"use client";

import { Bell, CalendarDays, ChevronDown, Clock3, Link2, MoreHorizontal, Paperclip, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Issue, Person, ProjectStatus, Status } from "@/lib/types";
import { Avatar } from "./workspace-app";

export function IssuePanel({ issue, statuses, currentUser, onClose, onMove, onUpdate, readOnly = false }: { issue: Issue; statuses: ProjectStatus[]; currentUser: Person; onClose: () => void; onMove: (status: Status) => void; onUpdate: (changes: Record<string, unknown>) => Promise<void>; readOnly?: boolean }) {
  const people = [currentUser];
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<Array<{ id: string; body: string; createdAt: string; author: { id: string; name: string } }>>([]);
  const [activities, setActivities] = useState<Array<{ id: string; action: string; createdAt: string; actor: { id: string; name: string } | null }>>([]);
  const [attachments, setAttachments] = useState<Array<{ id: string; fileName: string; contentType: string; size: number; createdAt: string }>>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description);
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [projectPeople, setProjectPeople] = useState<Person[]>([]);
  const [subtasks, setSubtasks] = useState<Issue[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [addingLabel, setAddingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/issues/${issue.id}/details`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { comments?: typeof comments; activities?: typeof activities; attachments?: typeof attachments; subtasks?: Issue[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Issue activity could not be loaded.");
        return result;
      })
      .then((result) => { setComments(result.comments ?? []); setActivities(result.activities ?? []); setAttachments(result.attachments ?? []); setSubtasks(result.subtasks ?? []); })
      .catch((cause: Error) => { if (cause.name !== "AbortError") setActivityError(cause.message); });
    return () => controller.abort();
  }, [issue.id]);

  useEffect(() => {
    const key = issue.key.split("-")[0];
    const controller = new AbortController();
    fetch(`/api/projects/${key}/people`, { signal: controller.signal }).then((response) => response.ok ? response.json() : { people: [] }).then((result: { people?: Person[] }) => setProjectPeople(result.people ?? [])).catch(() => undefined);
    return () => controller.abort();
  }, [issue.key]);

  useEffect(() => { const controller = new AbortController(); fetch(`/api/issues/${issue.id}/watch`, { signal: controller.signal }).then((response) => response.ok ? response.json() : { watching: false }).then((result: { watching: boolean }) => setWatching(result.watching)).catch(() => undefined); return () => controller.abort(); }, [issue.id]);

  async function toggleWatching() { const response = await fetch(`/api/issues/${issue.id}/watch`, { method: watching ? "DELETE" : "PUT" }); const result = await response.json() as { watching?: boolean; error?: string }; if (!response.ok) return setActivityError(result.error ?? "Watch state could not be changed."); setWatching(Boolean(result.watching)); }

  async function submitComment() {
    if (!comment.trim() || readOnly) return;
    setSubmittingComment(true);
    setActivityError(null);
    try {
      const response = await fetch(`/api/issues/${issue.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: comment }) });
      const result = await response.json() as { comment?: typeof comments[number]; error?: string };
      if (!response.ok || !result.comment) throw new Error(result.error ?? "Comment could not be added.");
      setComments((current) => [...current, result.comment!]);
      setComment("");
    } catch (cause) {
      setActivityError(cause instanceof Error ? cause.message : "Comment could not be added.");
    } finally {
      setSubmittingComment(false);
    }
  }
  async function saveDetails() {
    if (!title.trim() || readOnly) return;
    setSavingDetails(true);
    setActivityError(null);
    try { await onUpdate({ title, description }); }
    catch (cause) { setActivityError(cause instanceof Error ? cause.message : "Issue details could not be saved."); }
    finally { setSavingDetails(false); }
  }
  async function uploadAttachment(file: File) {
    setUploadingAttachment(true);
    setActivityError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/issues/${issue.id}/attachments`, { method: "POST", body: form });
      const result = await response.json() as { attachment?: typeof attachments[number]; error?: string };
      if (!response.ok || !result.attachment) throw new Error(result.error ?? "Attachment could not be uploaded.");
      setAttachments((current) => [result.attachment!, ...current]);
    } catch (cause) { setActivityError(cause instanceof Error ? cause.message : "Attachment could not be uploaded."); }
    finally { setUploadingAttachment(false); }
  }
  async function addSubtask() {
    if (!newSubtask.trim() || readOnly) return;
    setAddingSubtask(true); setActivityError(null);
    try {
      const response = await fetch(`/api/issues/${issue.id}/subtasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newSubtask }) });
      const result = await response.json() as { subtask?: Issue; error?: string };
      if (!response.ok || !result.subtask) throw new Error(result.error ?? "Subtask could not be created.");
      setSubtasks((current) => [...current, result.subtask!]); setNewSubtask("");
    } catch (cause) { setActivityError(cause instanceof Error ? cause.message : "Subtask could not be created."); }
    finally { setAddingSubtask(false); }
  }
  async function toggleSubtask(subtask: Issue) {
    const status = subtask.status === "Done" ? "To do" : "Done";
    const response = await fetch(`/api/issues/${subtask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const result = await response.json() as { issue?: Issue; error?: string };
    if (!response.ok || !result.issue) { setActivityError(result.error ?? "Subtask could not be updated."); return; }
    setSubtasks((current) => current.map((item) => item.id === subtask.id ? result.issue! : item));
  }
  async function saveLabels(labels: string[]) {
    try { await onUpdate({ labels }); setLabelDraft(""); setAddingLabel(false); }
    catch (cause) { setActivityError(cause instanceof Error ? cause.message : "Labels could not be saved."); }
  }
  return (
    <div className="panel-layer">
      <button className="panel-scrim" onClick={onClose} aria-label="Close issue" />
      <aside className="issue-panel" aria-label={`${issue.key} details`}>
        <header className="panel-header"><div className="panel-key"><span>{issue.key.split("-")[0]}</span><span>/</span><strong>{issue.key}</strong></div><div><button aria-label={watching ? "Stop watching issue" : "Watch issue"} aria-pressed={watching} onClick={() => void toggleWatching()}><Bell size={17} fill={watching ? "currentColor" : "none"} /></button><button aria-label="Copy link"><Link2 size={17} /></button><button aria-label="More actions"><MoreHorizontal size={18} /></button><button aria-label="Close" onClick={onClose}><X size={20} /></button></div></header>
        <div className="panel-body">
          <main className="issue-main">
            <div className="issue-type-line"><span className={`type-pill ${issue.type.toLowerCase()}`}>{issue.type}</span><span>Created {issue.createdAt ? formatTime(issue.createdAt) : "recently"}</span></div>
            {readOnly ? <h2>{issue.title}</h2> : <input className="issue-title-input" aria-label="Issue title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />}
            <section className="description-section"><h3>Description</h3>{readOnly ? <p>{issue.description}</p> : <><textarea className="issue-description-input" aria-label="Issue description" value={description} maxLength={20000} onChange={(event) => setDescription(event.target.value)} /><button className="secondary-button issue-save-button" disabled={savingDetails || !title.trim() || (title === issue.title && description === issue.description)} onClick={saveDetails}>{savingDetails ? "Saving…" : "Save details"}</button></>}</section>
            <section className="subtask-section"><div><h3>Subtasks</h3><span>{subtasks.filter((item) => item.status === "Done").length} of {subtasks.length}</span></div><div className="progress"><i style={{ width: subtasks.length ? `${subtasks.filter((item) => item.status === "Done").length / subtasks.length * 100}%` : "0%" }} /></div>{subtasks.map((subtask) => <label key={subtask.id}><input type="checkbox" checked={subtask.status === "Done"} disabled={readOnly} onChange={() => void toggleSubtask(subtask)} /><span>{subtask.title}</span><small>{subtask.key}</small></label>)}{!readOnly && <div className="subtask-create"><input aria-label="New subtask title" value={newSubtask} placeholder="Add a subtask" maxLength={200} onChange={(event) => setNewSubtask(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addSubtask(); }} /><button disabled={!newSubtask.trim() || addingSubtask} onClick={addSubtask}>{addingSubtask ? "Adding…" : "Add"}</button></div>}</section>
            <section className="activity-section"><div className="activity-heading"><h3>Activity</h3><button>All activity <ChevronDown size={14} /></button></div>{attachments.length > 0 && <div className="attachment-list">{attachments.map((item) => <a key={item.id} href={`/api/attachments/${item.id}`}><Paperclip size={14} /><span>{item.fileName}</span><small>{formatBytes(item.size)}</small></a>)}</div>}{!readOnly && <div className="comment-box"><Avatar person={people[0]} /><div><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment…" /><div><label className={uploadingAttachment ? "uploading" : ""}><Paperclip size={15} /> {uploadingAttachment ? "Uploading…" : "Attach"}<input type="file" disabled={uploadingAttachment} accept="image/*,.pdf,.zip,.json,.txt,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); event.target.value = ""; }} /></label><button disabled={!comment.trim() || submittingComment} onClick={submitComment}><Send size={14} /> {submittingComment ? "Posting…" : "Comment"}</button></div></div></div>}{activityError && <div className="members-error">{activityError}</div>}{comments.map((item) => <div className="activity-item" key={item.id}><Avatar person={{ name: item.author.name, initials: initials(item.author.name), color: colorFor(item.author.id) }} /><div><p><strong>{item.author.name}</strong> added a comment</p><blockquote>{item.body}</blockquote><span>{formatTime(item.createdAt)}</span></div></div>)}{activities.map((item) => <div className="activity-item" key={item.id}><Avatar person={{ name: item.actor?.name ?? "System", initials: initials(item.actor?.name ?? "System"), color: colorFor(item.actor?.id ?? item.id) }} /><div><p><strong>{item.actor?.name ?? "System"}</strong> {activityLabel(item.action)}</p><span>{formatTime(item.createdAt)}</span></div></div>)}</section>
          </main>
          <aside className="issue-properties">
            <label>Status</label><select value={issue.status} disabled={readOnly} onChange={(event) => onMove(event.target.value as Status)}>{statuses.map((status) => <option key={status.id}>{status.name}</option>)}</select>
            <label>Assignee</label><select value={issue.assignee?.id ?? ""} disabled={readOnly} onChange={(event) => onUpdate({ assigneeId: event.target.value || null }).catch((cause) => setActivityError(cause instanceof Error ? cause.message : "Assignee could not be saved."))}><option value="">Unassigned</option>{projectPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
            <label>Priority</label><select value={issue.priority} disabled={readOnly} onChange={(event) => onUpdate({ priority: event.target.value }).catch((cause) => setActivityError(cause instanceof Error ? cause.message : "Priority could not be saved."))}>{["Urgent", "High", "Medium", "Low"].map((priority) => <option key={priority}>{priority}</option>)}</select>
            <label>Estimate</label><select value={issue.points ?? ""} disabled={readOnly} onChange={(event) => onUpdate({ estimate: event.target.value === "" ? null : Number(event.target.value) }).catch((cause) => setActivityError(cause instanceof Error ? cause.message : "Estimate could not be saved."))}><option value="">Not estimated</option>{[1, 2, 3, 5, 8, 13, 21].map((points) => <option key={points} value={points}>{points} points</option>)}</select>
            <label>Sprint</label><span className="property-value"><Clock3 size={16} />{issue.sprint?.name ?? "Backlog"}</span>
            <label>Due date</label><div className="date-property"><CalendarDays size={15} /><input type="date" aria-label="Due date" value={issue.dueDate ?? ""} disabled={readOnly} onChange={(event) => onUpdate({ dueDate: event.target.value || null }).catch((cause) => setActivityError(cause instanceof Error ? cause.message : "Due date could not be saved."))} /></div>
            <label>Labels</label><div className="property-labels">{issue.labels.map((label) => <span key={label}>{label}{!readOnly && <button aria-label={`Remove ${label} label`} onClick={() => void saveLabels(issue.labels.filter((item) => item !== label))}>×</button>}</span>)}{!readOnly && (addingLabel ? <input autoFocus aria-label="New label" value={labelDraft} maxLength={50} onChange={(event) => setLabelDraft(event.target.value)} onBlur={() => { if (!labelDraft.trim()) setAddingLabel(false); }} onKeyDown={(event) => { if (event.key === "Enter" && labelDraft.trim()) void saveLabels([...issue.labels, labelDraft.trim()]); if (event.key === "Escape") setAddingLabel(false); }} /> : <button aria-label="Add label" onClick={() => setAddingLabel(true)}>+</button>)}</div>
            <div className="property-divider" />
            <p className="property-small">Reporter <strong>{issue.reporter?.name ?? "Unknown"}</strong></p><p className="property-small">Last updated <strong>{issue.updatedAt ? formatTime(issue.updatedAt) : "recently"}</strong></p>
          </aside>
        </div>
      </aside>
    </div>
  );
}

function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function colorFor(value: string) { const colors = ["#7967e8", "#0b9f8d", "#dc6c56", "#3f7acb"]; let hash = 0; for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0; return colors[Math.abs(hash) % colors.length]; }
function formatTime(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function activityLabel(action: string) { if (action === "issue.created") return "created this issue"; if (action === "issue.status_changed") return "changed the status"; if (action === "issue.updated") return "updated issue details"; if (action === "attachment.added") return "added an attachment"; if (action === "subtask.created") return "created a subtask"; return action.replaceAll(".", " "); }
function formatBytes(size: number) { return size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
