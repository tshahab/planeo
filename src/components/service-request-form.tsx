"use client";

import { useEffect, useState } from "react";
import type { PortalField, PortalSchema } from "@/lib/service-requests";

type Form = { id: string; version: number; name: string; description: string | null; schema: PortalSchema; consentText: string | null };

export function ServiceRequestForm({ requestTypeId }: { requestTypeId: string }) {
  const [form, setForm] = useState<Form | null>(null); const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`/api/service/forms/${requestTypeId}`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setForm(body.form); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Form unavailable.")); }, [requestTypeId]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { const response = await fetch(`/api/service/forms/${requestTypeId}/submissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setSuccess(body.request.key); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Request could not be submitted."); setBusy(false); }
  }
  if (error && !form) return <main className="auth-shell"><div className="login-error" role="alert">{error}</div></main>;
  if (!form) return <main className="auth-shell" aria-busy="true"><p role="status">Loading request form…</p></main>;
  if (success) return <main className="auth-shell"><section className="login-card"><h1>Request received</h1><p role="status">Your request <strong>{success}</strong> was created.</p></section></main>;
  return <main className="auth-shell"><form className="login-card" onSubmit={submit}><header><p className="eyebrow">SERVICE REQUEST</p><h1>{form.name}</h1>{form.description && <p>{form.description}</p>}</header>
    {form.schema.fields.map((field) => visible(field, values) && <PortalInput key={field.key} requestTypeId={requestTypeId} field={field} value={values[field.key]} reportError={setError} update={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />)}
    {form.consentText && <label><input type="checkbox" checked={values.consent === true} onChange={(event) => setValues((current) => ({ ...current, consent: event.target.checked }))} required /> {form.consentText}</label>}
    {error && <div className="login-error" role="alert">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
  </form></main>;
}

function visible(field: PortalField, values: Record<string, unknown>) { return !field.visibleWhen || values[field.visibleWhen.fieldKey] === field.visibleWhen.equals; }
function PortalInput({ requestTypeId, field, value, update, reportError }: { requestTypeId: string; field: PortalField; value: unknown; update: (value: unknown) => void; reportError: (error: string | null) => void }) {
  const id = `portal-${field.key}`; const text = typeof value === "string" ? value : "";
  return <label htmlFor={id}><span>{field.label}{field.required && " *"}</span>{field.helpText && <small id={`${id}-help`}>{field.helpText}</small>}
    {field.kind === "attachment" ? <input id={id} type="file" multiple required={field.required && (!Array.isArray(value) || value.length === 0)} aria-describedby={field.helpText ? `${id}-help` : undefined} onChange={async (event) => {
      reportError(null); const ids: string[] = [];
      try { for (const file of [...(event.target.files ?? [])]) { const data = new FormData(); data.set("file", file); const response = await fetch(`/api/service/forms/${requestTypeId}/attachments`, { method: "POST", body: data }); const body = await response.json(); if (!response.ok) throw new Error(body.error); ids.push(body.upload.id); } update(ids); }
      catch (cause) { event.target.value = ""; update([]); reportError(cause instanceof Error ? cause.message : "Attachment could not be uploaded."); }
    }} />
      : field.kind === "description" ? <textarea id={id} value={text} required={field.required} aria-describedby={field.helpText ? `${id}-help` : undefined} onChange={(event) => update(event.target.value)} />
      : field.kind === "priority" || field.options ? <select id={id} value={text} required={field.required} onChange={(event) => update(event.target.value)}><option value="">Choose…</option>{(field.options ?? ["Low", "Medium", "High", "Urgent"]).map((option) => <option key={option}>{option}</option>)}</select>
      : <input id={id} value={text} required={field.required} minLength={field.validation?.minLength} maxLength={field.validation?.maxLength} pattern={field.validation?.pattern} aria-describedby={field.helpText ? `${id}-help` : undefined} onChange={(event) => update(event.target.value)} />}
  </label>;
}
