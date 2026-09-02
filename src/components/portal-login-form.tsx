"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function PortalLoginForm({ workspace }: { workspace: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(recovery ? "/api/portal/auth/recovery/request" : "/api/portal/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace, email: data.get("email"), password: data.get("password") }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Request failed.");
      if (recovery) setMessage(body.message);
      else { router.push(`/portal/${body.workspace}`); router.refresh(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}>
    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
    {!recovery && <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>}
    {error && <p className="login-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button disabled={busy}>{busy ? "Please wait…" : recovery ? "Send recovery email" : "Sign in"}</button>
    <button type="button" disabled={busy} onClick={() => { setRecovery(!recovery); setError(""); setMessage(""); }}>{recovery ? "Back to sign in" : "Forgot password?"}</button>
  </form>;
}
