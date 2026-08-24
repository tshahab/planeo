import { redirect } from "next/navigation";
import { AuditLog } from "@/components/audit-log";
import { getAuthContext } from "@/lib/auth";
export default async function AuditPage(){const context=await getAuthContext();if(!context)redirect('/login');if(context.role!=='OWNER'&&context.role!=='ADMIN')redirect('/');return <AuditLog workspaceName={context.workspace.name}/>;}
