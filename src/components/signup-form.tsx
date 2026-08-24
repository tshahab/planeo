"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignupForm() {
  const router = useRouter(); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); const data = new FormData(event.currentTarget); try { const response = await fetch('/api/auth/signup', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(data)) }); const result = await response.json() as { error?:string }; if (!response.ok) throw new Error(result.error ?? 'Signup failed.'); router.replace('/'); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Signup failed.'); setBusy(false); } }
  return <AuthShell title="Create your workspace" intro="Start with a ready-to-use project for your team."><form onSubmit={submit}><label>Your name<input name="name" autoComplete="name" required maxLength={100} /></label><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>12+ characters with uppercase, lowercase, and a number.</small></label><label>Workspace name<input name="workspaceName" required maxLength={100} /></label><label>Workspace URL<input name="slug" pattern="[a-z0-9-]+" placeholder="acme-team" required maxLength={48} /></label>{error && <div className="login-error">{error}</div>}<button disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button><p>Already have an account? <Link href="/login">Sign in</Link></p></form></AuthShell>;
}

export function AuthShell({ title, intro, children }: { title:string; intro:string; children:React.ReactNode }) { return <main className="auth-page"><section><Link className="auth-brand" href="/"><span>P</span> Planeo</Link><h1>{title}</h1><p>{intro}</p>{children}</section></main>; }
