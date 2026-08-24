import { notFound, redirect } from "next/navigation";
import { WorkflowSettings } from "@/components/workflow-settings";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
export default async function WorkflowPage({params}:{params:Promise<{key:string}>}){const context=await getAuthContext();if(!context)redirect('/login');const{key}=await params;const project=await db.project.findUnique({where:{workspaceId_key:{workspaceId:context.workspace.id,key:key.toUpperCase()}}});if(!project)notFound();const membership=await db.projectMember.findUnique({where:{projectId_userId:{projectId:project.id,userId:context.user.id}}});if(context.role!=='OWNER'&&context.role!=='ADMIN'&&membership?.role!=='ADMIN')redirect(`/projects/${project.key}`);return <WorkflowSettings projectKey={project.key} projectName={project.name}/>;}
