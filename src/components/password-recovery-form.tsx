"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "./signup-form";

export function PasswordRecoveryForm({ reset = false }: { reset?:boolean }) {
  const params = useSearchParams(); const [message, setMessage] = useState<string|null>(null); const [error, setError] = useState<string|null>(null); const [busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); const values=Object.fromEntries(new FormData(event.currentTarget)); const body=reset ? { token:params.get('token'), password:values.password } : { email:values.email }; try { const response=await fetch(reset?'/api/auth/password-reset/confirm':'/api/auth/password-reset/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const result=await response.json() as {error?:string;developmentToken?:string}; if(!response.ok) throw new Error(result.error??'Request failed.'); setMessage(reset?'Password updated. You can sign in now.':result.developmentToken?`Development reset token: ${result.developmentToken}`:'If that account exists, reset instructions are on the way.'); } catch(cause){setError(cause instanceof Error?cause.message:'Request failed.');} finally{setBusy(false);} }
  return <AuthShell title={reset?'Choose a new password':'Reset your password'} intro={reset?'This reset link can only be used once.':'We will send instructions if an account matches that email.'}><form onSubmit={submit}>{reset?<label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>:<label>Email<input name="email" type="email" autoComplete="email" required /></label>}{error&&<div className="login-error">{error}</div>}{message&&<div className="auth-success">{message}</div>}<button disabled={busy}>{busy?'Working…':reset?'Update password':'Send reset instructions'}</button><p><Link href="/login">Back to sign in</Link></p></form></AuthShell>;
}
