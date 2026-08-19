"use client";

import { ArrowRight, CheckCircle2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface InvitationDetails { email: string; workspaceName: string; projectName: string | null; projectKey: string | null; role: string; expiresAt: string; requiresName: boolean }

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${encodeURIComponent(token)}`).then(async (response) => {
      const result = await response.json() as { invitation?: InvitationDetails; error?: string };
      if (!response.ok || !result.invitation) throw new Error(result.error ?? "Invitation could not be loaded.");
      return result.invitation;
    }).then(setInvitation).catch((cause: Error) => setError(cause.message));
  }, [token]);

  async function accept(event: React.FormEvent) {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Invitation could not be accepted.");
      router.replace("/");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invitation could not be accepted."); setSubmitting(false); }
  }

  return <main className="login-page"><section className="login-story"><div className="login-brand"><span>P</span> Planeo</div><div><p className="login-kicker">YOU’RE INVITED</p><h1>Join the work.<br />Move it forward.</h1><p>Accept your invitation to plan, discuss, and deliver work with your team.</p><ul><li><CheckCircle2 /> One secure workspace</li><li><CheckCircle2 /> Clear project access</li><li><CheckCircle2 /> A durable activity history</li></ul></div><small>Invitation links are single-use and expire automatically.</small></section><section className="login-form-side"><form onSubmit={accept}><div className="login-lock"><UserPlus /></div><h2>Accept invitation</h2>{invitation ? <><p>Join <strong>{invitation.workspaceName}</strong>{invitation.projectName ? ` on ${invitation.projectName} (${invitation.projectKey})` : ""}.</p><label>Email address</label><input value={invitation.email} disabled />{invitation.requiresName && <><label htmlFor="invite-name">Your name</label><input id="invite-name" value={name} maxLength={120} autoComplete="name" onChange={(event) => setName(event.target.value)} required /></>}<label htmlFor="invite-password">{invitation.requiresName ? "Create password" : "Current password"}</label><input id="invite-password" type="password" value={password} minLength={10} maxLength={200} autoComplete={invitation.requiresName ? "new-password" : "current-password"} onChange={(event) => setPassword(event.target.value)} required /></> : <p>{error ? "The invitation cannot be used." : "Loading invitation…"}</p>}{error && <div className="login-error" role="alert">{error}</div>}<button disabled={!invitation || submitting}>{submitting ? "Joining…" : "Accept and join"}<ArrowRight size={17} /></button></form></section></main>;
}
