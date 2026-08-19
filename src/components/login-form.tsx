"use client";

import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("mina@planeo.co");
  const [password, setPassword] = useState("planeo-demo");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sign in failed.");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="login-page"><section className="login-story"><div className="login-brand"><span>P</span> Planeo</div><div><p className="login-kicker">WORK, CLEARLY</p><h1>Move good work<br />forward.</h1><p>One calm place for your team to plan, discuss, and ship meaningful work.</p><ul><li><CheckCircle2 /> Focused issue tracking</li><li><CheckCircle2 /> Fast, flexible boards</li><li><CheckCircle2 /> A durable activity history</li></ul></div><small>Built for teams who value clarity.</small></section><section className="login-form-side"><form onSubmit={submit}><div className="login-lock"><LockKeyhole /></div><h2>Welcome back</h2><p>Sign in to continue to your workspace.</p><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />{error && <div className="login-error" role="alert">{error}</div>}<button disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button><div className="demo-credentials"><strong>Demo workspace</strong><span>Use any seeded `@planeo.co` account with password `planeo-demo`.</span></div></form></section></main>;
}
