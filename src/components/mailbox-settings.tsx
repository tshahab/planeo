"use client";
import { useEffect, useState } from "react";

type Diagnostics = { id: string; status: string; reason: string | null; receivedAt: string };
export function MailboxSettings({ projectKey, types }: { projectKey: string; types: { id: string; name: string }[] }) {
  const [address, setAddress] = useState("");
  const [requestTypeId, setType] = useState(types[0]?.id ?? "");
  const [enabled, setEnabled] = useState(true);
  const [secret, setSecret] = useState("");
  const [mailboxId, setMailboxId] = useState("");
  const [messages, setMessages] = useState<Diagnostics[]>([]);
  const [failures, setFailures] = useState<{ id: string; lastError: string | null; updatedAt: string }[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${projectKey}/mailbox`).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!active || !data.mailbox) return;
      setAddress(data.mailbox.address); setType(data.mailbox.requestTypeId); setEnabled(data.mailbox.enabled);
      setMailboxId(data.mailbox.id); setMessages(data.mailbox.messages);
      setFailures(data.failures ?? []);
    }).catch(() => { if (active) setNotice("Unable to load mailbox settings."); });
    return () => { active = false; };
  }, [projectKey]);
  return <section><p>Connect a trusted mail adapter. Only verified customers with current project access can create requests. Saving rotates the signing secret; update your adapter immediately.</p>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setSecret("");
      try {
        const response = await fetch(`/api/projects/${projectKey}/mailbox`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, requestTypeId, enabled }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to save mailbox.");
        setSecret(data.secret); setMailboxId(data.mailbox.id); setNotice("Saved. Copy the secret now; it is shown only once.");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save mailbox."); }
      finally { setBusy(false); }
    }}>
      <label>Inbound address<input type="email" required value={address} onChange={event => setAddress(event.target.value)} /></label>
      <label>Published request type<select required value={requestTypeId} onChange={event => setType(event.target.value)}>{types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
      <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Enabled</label>
      <button disabled={busy || !types.length}>{busy ? "Saving…" : "Save and rotate secret"}</button>
    </form>
    <p role="status">{notice}</p>
    {mailboxId && <p>Adapter endpoint: <code>/api/service/mail/{mailboxId}</code></p>}
    {secret && <label>Signing secret<input readOnly value={secret} autoComplete="off" /></label>}
    <h2>Recent inbound deliveries</h2>
    <h3>Delivery failures and bounces</h3><ul>{failures.map(failure => <li key={failure.id}>{failure.updatedAt}: {failure.lastError}</li>)}</ul>
    <ul>{messages.map(message => <li key={message.id}>{message.receivedAt}: {message.status}{message.reason && ` — ${message.reason}`}</li>)}</ul>
    <p>Quarantined content is not stored. Ask the customer to use the portal for consent, required fields, or a safe attachment.</p>
  </section>;
}
