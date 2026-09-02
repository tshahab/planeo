"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function PortalNotificationActions({ workspace }: { workspace: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function markRead() {
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/portal/${workspace}/notifications`, { method: "PATCH" }); if (!response.ok) throw new Error("Notifications could not be updated."); setMessage("Notifications marked as read."); router.refresh(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <div><button className="secondary-button" disabled={busy} onClick={markRead}>{busy ? "Updating…" : "Mark all read"}</button><p role="status">{message}</p></div>;
}
