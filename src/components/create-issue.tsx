"use client";

import { ChevronDown, Paperclip, X } from "lucide-react";
import { useState } from "react";
import type { Issue, Person, Priority, ProjectIssueType, ProjectStatus, ProjectSummary } from "@/lib/types";

export function CreateIssue({ project, people, issueTypes, statuses, nextNumber, onClose, onCreate }: { project: ProjectSummary; people: Person[]; issueTypes: ProjectIssueType[]; statuses: ProjectStatus[]; nextNumber: number; onClose: () => void; onCreate: (issue: Issue) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [assignee, setAssignee] = useState(people[0]?.id ?? "");
  const [issueTypeId, setIssueTypeId] = useState(issueTypes[0]?.id ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const issueType = issueTypes.find((item) => item.id === issueTypeId) ?? issueTypes[0];
    onCreate({ id: crypto.randomUUID(), issueTypeId: issueType?.id, key: `${project.key}-${nextNumber}`, title: title.trim(), description: description.trim() || "No description yet.", status: statuses[0]?.name ?? "Backlog", priority, type: issueType?.name ?? "Task", assignee: people.find((person) => person.id === assignee), labels: [], comments: 0, attachments: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  return <div className="modal-layer">
    <button className="modal-scrim" onClick={onClose} aria-label="Close dialog" />
    <form className="create-modal" onSubmit={submit}>
      <header><div><span>Create issue in</span><strong><span className="project-icon purple">{project.name[0]}</span> {project.name} <ChevronDown size={14} /></strong></div><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
      <div className="modal-content">
        <label className="field-label" htmlFor="summary">Summary <b>*</b></label><input id="summary" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" />
        <label className="field-label" htmlFor="description">Description</label><textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context, acceptance criteria, or useful links…" />
        <div className="field-grid">
          <label><span>Issue type</span><select value={issueTypeId} onChange={(event) => setIssueTypeId(event.target.value)}>{issueTypes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option>Urgent</option><option>High</option><option>Medium</option><option>Low</option></select></label>
          <label><span>Assignee</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Unassigned</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
        </div>
        <button className="attach-button" type="button"><Paperclip size={16} /> Attach files</button>
      </div>
      <footer><span><kbd>⌘</kbd> + <kbd>Enter</kbd> to create</span><div><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim() || !issueTypeId}>Create issue</button></div></footer>
    </form>
  </div>;
}
