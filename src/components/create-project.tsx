"use client";

import { FolderKanban, X } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectSummary } from "@/lib/types";

export function CreateProject({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<"KANBAN" | "SCRUM" | "SERVICE">("KANBAN");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function changeName(value: string) {
    setName(value);
    if (!key || key === name.replace(/[^a-z]/gi, "").slice(0, 4).toUpperCase()) setKey(value.replace(/[^a-z]/gi, "").slice(0, 4).toUpperCase());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, key, description, template, visibility }) });
      const result = await response.json() as { project?: ProjectSummary; error?: string };
      if (!response.ok || !result.project) throw new Error(result.error ?? "The project could not be created.");
      router.push(`/projects/${result.project.key}`); router.refresh(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The project could not be created."); setSubmitting(false); }
  }

  return <div className="modal-layer">
    <button className="modal-scrim" onClick={onClose} aria-label="Close dialog" />
    <form className="create-modal project-modal" onSubmit={submit}>
      <header><div><span>NEW PROJECT</span><strong><FolderKanban size={18} /> Create a project</strong></div><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
      <div className="modal-content">
        <label className="field-label" htmlFor="project-name">Project name <b>*</b></label><input id="project-name" autoFocus value={name} onChange={(event) => changeName(event.target.value)} placeholder="e.g. Customer support" />
        <label className="field-label" htmlFor="project-key">Project key <b>*</b></label><input id="project-key" value={key} onChange={(event) => setKey(event.target.value.replace(/[^a-z]/gi, "").slice(0, 10).toUpperCase())} placeholder="HELP" /><small className="field-hint">Issues will use keys such as {key || "HELP"}-123.</small>
        <label className="field-label" htmlFor="project-description">Description</label><textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will this team plan and deliver?" />
        <div className="field-grid"><label><span>Template</span><select value={template} onChange={(event) => setTemplate(event.target.value as typeof template)}><option value="KANBAN">Kanban</option><option value="SCRUM">Scrum</option><option value="SERVICE">Service management</option></select></label><label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="PUBLIC">Workspace</option><option value="PRIVATE">Private</option></select></label></div>
        {error && <div className="login-error" role="alert">{error}</div>}
      </div>
      <footer><span>Defaults can be changed later in project settings.</span><div><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={submitting || name.trim().length < 2 || key.length < 2}>{submitting ? "Creating…" : "Create project"}</button></div></footer>
    </form>
  </div>;
}
