import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { NotificationInbox } from "@/components/notification-inbox";

export default async function NotificationsPage() { const context = await getAuthContext(); if (!context) redirect("/login"); return <NotificationInbox workspaceName={context.workspace.name} />; }
