"use client";

import { AlertCircle, Bug, CheckSquare2, ChevronDown, MessageSquare, MoreHorizontal, Paperclip, Plus, Zap } from "lucide-react";
import { columns } from "@/lib/demo-data";
import type { Issue, Priority, Status } from "@/lib/types";
import { Avatar } from "./workspace-app";

const priorityIcon: Record<Priority, React.ReactNode> = {
  Urgent: <AlertCircle size={14} />, High: <Zap size={14} />, Medium: <span className="priority-bars">≡</span>, Low: <ChevronDown size={14} />,
};

export function Board({ issues, onSelect, onMove, onCreate, readOnly = false }: { issues: Issue[]; onSelect: (issue: Issue) => void; onMove: (id: string, status: Status) => void; onCreate: () => void; readOnly?: boolean }) {
  return (
    <div className="board" aria-label="Project board">
      {columns.map((column) => {
        const columnIssues = issues.filter((issue) => issue.status === column.status);
        const points = columnIssues.reduce((sum, issue) => sum + (issue.points ?? 0), 0);
        return (
          <section className="board-column" key={column.status} onDragOver={(event) => { if (!readOnly) event.preventDefault(); }} onDrop={(event) => { if (readOnly) return; const id = event.dataTransfer.getData("text/plain"); if (id) onMove(id, column.status); }}>
            <header className="column-header"><span className="status-indicator" style={{ background: column.tint }} /><strong>{column.label}</strong><span className="column-count">{columnIssues.length}</span><span className="points-total">{points} pts</span><button aria-label={`${column.label} options`}><MoreHorizontal size={16} /></button></header>
            <div className="card-list">
              {columnIssues.map((issue) => <IssueCard key={issue.id} issue={issue} onSelect={() => onSelect(issue)} draggable={!readOnly} />)}
              {columnIssues.length === 0 && <div className="empty-column">Drop issues here</div>}
            </div>
            {!readOnly && <button className="column-create" onClick={onCreate}><Plus size={15} /> Create issue</button>}
          </section>
        );
      })}
    </div>
  );
}

function IssueCard({ issue, onSelect, draggable }: { issue: Issue; onSelect: () => void; draggable: boolean }) {
  return (
    <article className="issue-card" draggable={draggable} onDragStart={(event) => { if (!draggable) return; event.dataTransfer.setData("text/plain", issue.id); event.dataTransfer.effectAllowed = "move"; }} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(); }} role="button" tabIndex={0}>
      <div className="card-key"><span className={`type-icon ${issue.type.toLowerCase()}`}>{issue.type === "Bug" ? <Bug size={13} /> : issue.type === "Epic" ? <Zap size={13} /> : <CheckSquare2 size={13} />}</span>{issue.key}<button aria-label="Issue actions" onClick={(event) => event.stopPropagation()}><MoreHorizontal size={15} /></button></div>
      <h3>{issue.title}</h3>
      <div className="labels">{issue.labels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="card-meta"><span className={`priority ${issue.priority.toLowerCase()}`}>{priorityIcon[issue.priority]}<span className="sr-only">{issue.priority}</span></span>{issue.points && <span className="points">{issue.points}</span>}<span className="card-spacer" />{issue.attachments > 0 && <span><Paperclip size={13} />{issue.attachments}</span>}{issue.comments > 0 && <span><MessageSquare size={13} />{issue.comments}</span>}{issue.assignee && <Avatar person={issue.assignee} />}</div>
    </article>
  );
}
