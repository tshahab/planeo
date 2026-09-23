import{redirect}from"next/navigation";import{getAuthContext}from"@/lib/auth";import{GoalsDirectory}from"@/components/goals-directory";
export default async function GoalsPage(){const context=await getAuthContext();if(!context)redirect("/login");return <GoalsDirectory workspaceName={context.workspace.name}/>}
