import { redirect } from "next/navigation";
import { WorkspaceAdministration } from "@/components/workspace-administration";
import { getAuthContext } from "@/lib/auth";
export default async function WorkspaceSettingsPage(){const context=await getAuthContext();if(!context)redirect('/login');if(!['OWNER','ADMIN'].includes(context.role))redirect('/settings/profile');return <WorkspaceAdministration currentUserId={context.user.id}/>;}
