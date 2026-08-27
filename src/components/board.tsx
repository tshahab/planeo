"use client";

import { AlertCircle, Bug, CheckSquare2, ChevronDown, MessageSquare, MoreHorizontal, Paperclip, Plus, Zap } from "lucide-react";
import type { Issue, Priority, ProjectStatus, Status } from "@/lib/types";
import { Avatar } from "./workspace-app";

const priorityIcon: Record<Priority, React.ReactNode> = {
  Urgent: <AlertCircle size={14} />, High: <Zap size={14} />, Medium: <span className="priority-bars">≡</span>, Low: <ChevronDown size={14} />,
};

export function Board({ issues, statuses, onSelect, onMove, onCreate, readOnly = false }: { issues: Issue[]; statuses: ProjectStatus[]; onSelect: (issue: Issue) => void; onMove: (id: string, status: Status) => void; onCreate: () => void; readOnly?: boolean }) {
  return (
    <div className="board" aria-label="Project board">
      {statuses.map((column) => {
        const columnIssues = issues.filter((issue) => issue.status === column.name);
        const points = columnIssues.reduce((sum, issue) => sum + (issue.points ?? 0), 0);
        return (
          <section className="board-column" key={column.id} onDragOver={(event) => { if (!readOnly) event.preventDefault(); }} onDrop={(event) => { if (readOnly) return; const id = event.dataTransfer.getData("text/plain"); if (id) onMove(id, column.name); }}>
            <header className="column-header"><span className="status-indicator" style={{ background: column.color }} /><strong>{column.name}</strong><span className="column-count">{columnIssues.length}{column.wipLimit ? ` / ${column.wipLimit}` : ""}</span><span className="points-total">{points} pts</span><button aria-label={`${column.name} options`}><MoreHorizontal size={16} /></button></header>
            <div className="card-list">
              {columnIssues.map((issue) => <IssueCard key={issue.id} issue={issue} statuses={statuses} onSelect={() => onSelect(issue)} onMove={onMove} draggable={!readOnly} />)}
              {columnIssues.length === 0 && <div className="empty-column">Drop issues here</div>}
            </div>
            {!readOnly && <button className="column-create" onClick={onCreate}><Plus size={15} /> Create issue</button>}
          </section>
        );
      })}
    </div>
  );
}

function IssueCard({ issue, statuses, onSelect, onMove, draggable }: { issue: Issue; statuses: ProjectStatus[]; onSelect: () => void; onMove: (id: string, status: Status) => void; draggable: boolean }) {
  const statusIndex = statuses.findIndex((status) => status.name === issue.status);
  return (
    <article className="issue-card" aria-label={`${issue.key}: ${issue.title}. ${issue.priority} priority. Status ${issue.status}.`} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" draggable={draggable} onDragStart={(event) => { if (!draggable) return; event.dataTransfer.setData("text/plain", issue.id); event.dataTransfer.effectAllowed = "move"; }} onClick={onSelect} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); return; }
      if (!event.altKey || !draggable) return;
      const offset = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const next = statuses[statusIndex + offset];
      if (offset && next) { event.preventDefault(); onMove(issue.id, next.name); }
    }} role="button" tabIndex={0}>
      <div className="card-key"><span className={`type-icon ${issue.type.toLowerCase()}`}>{issue.type === "Bug" ? <Bug size={13} /> : issue.type === "Epic" ? <Zap size={13} /> : <CheckSquare2 size={13} />}</span>{issue.key}<button aria-label="Issue actions" onClick={(event) => event.stopPropagation()}><MoreHorizontal size={15} /></button></div>
      <h3>{issue.title}</h3>
      <div className="labels">{issue.labels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="card-meta"><span className={`priority ${issue.priority.toLowerCase()}`} title={`${issue.priority} priority`}>{priorityIcon[issue.priority]}<span className="priority-label">{issue.priority}</span></span>{issue.points && <span className="points">{issue.points}</span>}<span className="card-spacer" />{issue.attachments > 0 && <span><Paperclip size={13} />{issue.attachments}</span>}{issue.comments > 0 && <span><MessageSquare size={13} />{issue.comments}</span>}{issue.assignee && <Avatar person={issue.assignee} />}</div>
    </article>
  );
}
