import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { WorkspaceSearch } from "@/components/workspace-search";

export default async function SearchPage() {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  return <WorkspaceSearch workspaceName={context.workspace.name} currentUserId={context.user.id} />;
}
