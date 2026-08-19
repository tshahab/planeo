"use client";

import { MailPlus, ShieldCheck, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";

type Role = "ADMIN" | "MEMBER" | "VIEWER";
interface Member { id: string; name: string; email: string; role: Role }
interface Invitation { id: string; email: string; projectRole: Role; expiresAt: string }

export function ProjectMembers({ projectKey, projectName, onClose }: { projectKey: string; projectName: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/projects/${projectKey}/members`);
    const result = await response.json() as { members?: Member[]; pendingInvitations?: Invitation[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Members could not be loaded.");
    setMembers(result.members ?? []);
    setInvitations(result.pendingInvitations ?? []);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/${projectKey}/members`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { members?: Member[]; pendingInvitations?: Invitation[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Members could not be loaded.");
        return result;
      })
      .then((result) => { setMembers(result.members ?? []); setInvitations(result.pendingInvitations ?? []); })
      .catch((cause: Error) => { if (cause.name !== "AbortError") setError(cause.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [projectKey]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectKey}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The member could not be added.");
      setEmail("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The member could not be added.");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeRole(userId: string, nextRole: Role) {
    const previous = members;
    setMembers((current) => current.map((member) => member.id === userId ? { ...member, role: nextRole } : member));
    setError(null);
    const response = await fetch(`/api/projects/${projectKey}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role: nextRole }) });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      setMembers(previous);
      setError(result.error ?? "The role could not be changed.");
    }
  }

  return <div className="modal-layer"><button className="modal-scrim" onClick={onClose} aria-label="Close project members" /><section className="members-modal" aria-label={`${projectName} members`}><header><div><span className="members-icon"><ShieldCheck /></span><div><h2>Project members</h2><p>{projectName} · {projectKey}</p></div></div><button onClick={onClose} aria-label="Close"><X size={20} /></button></header><form className="invite-row" onSubmit={invite}><div><label htmlFor="member-email">Email address</label><input id="member-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" required /></div><div><label htmlFor="member-role">Project role</label><select id="member-role" value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="ADMIN">Admin</option><option value="MEMBER">Member</option><option value="VIEWER">Viewer</option></select></div><button disabled={submitting}><UserPlus size={16} />{submitting ? "Adding…" : "Add member"}</button></form>{error && <div className="members-error" role="alert">{error}</div>}<div className="members-content"><h3>Members <span>{members.length}</span></h3>{loading ? <div className="members-loading">Loading members…</div> : <div className="member-list">{members.map((member) => <div className="member-row" key={member.id}><span className="member-avatar">{member.name.split(/\s+/).map((part) => part[0]).join("").slice(0,2)}</span><div><strong>{member.name}</strong><span>{member.email}</span></div><select aria-label={`${member.name} role`} value={member.role} onChange={(event) => changeRole(member.id, event.target.value as Role)}><option value="ADMIN">Admin</option><option value="MEMBER">Member</option><option value="VIEWER">Viewer</option></select></div>)}</div>}{invitations.length > 0 && <><h3 className="pending-heading">Pending invitations <span>{invitations.length}</span></h3><div className="member-list">{invitations.map((invitation) => <div className="member-row pending" key={invitation.id}><span className="member-avatar"><MailPlus size={15} /></span><div><strong>{invitation.email}</strong><span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></div><span className="role-badge">{invitation.projectRole.toLowerCase()}</span></div>)}</div></>}</div></section></div>;
}
