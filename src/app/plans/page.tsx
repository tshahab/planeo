import { redirect } from "next/navigation";import { getAuthContext } from "@/lib/auth";import { PortfolioPlans } from "@/components/portfolio-plans";
export default async function PlansPage(){const context=await getAuthContext();if(!context)redirect("/login");return <PortfolioPlans workspaceName={context.workspace.name}/>}
