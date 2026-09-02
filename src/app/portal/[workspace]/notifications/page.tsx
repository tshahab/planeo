import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPortalContext, portalRequestWhere } from "@/lib/portal-auth";
import { PortalNotificationActions } from "@/components/portal-notification-actions";

export default async function PortalNotifications({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params; const context = await getPortalContext();
  if (!context) redirect(`/portal/login?workspace=${encodeURIComponent(workspace)}`);
  if (context.workspace.slug !== workspace) notFound();
  const notifications = await db.portalNotification.findMany({ where: { workspaceId: context.workspace.id, customerId: context.customer.id, OR: [{ requestId: null }, { request: { is: portalRequestWhere(context) } }] }, select: { id: true, requestId: true, message: true, readAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return <main className="portal-page"><header><strong>{context.workspace.name}</strong><Link href={`/portal/${workspace}`}>All requests</Link></header><section className="portal-detail"><h1>Notifications</h1><PortalNotificationActions workspace={workspace} />{notifications.length ? notifications.map(item => <section key={item.id}><p>{item.readAt ? "Read" : "Unread"} · {item.createdAt.toLocaleString()}</p>{item.requestId ? <Link href={`/portal/${workspace}/requests/${item.requestId}`}>{item.message}</Link> : <p>{item.message}</p>}</section>) : <p>No notifications.</p>}</section></main>;
}
