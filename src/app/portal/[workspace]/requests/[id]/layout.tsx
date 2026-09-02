import { SlaTargets } from "@/components/sla-targets";
export default async function RequestLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspace: string; id: string }> }) {
  const { workspace, id } = await params;
  return <>{children}<aside className="portal-detail" aria-label="Request service targets"><SlaTargets endpoint={`/api/portal/${encodeURIComponent(workspace)}/requests/${encodeURIComponent(id)}/sla`} /></aside></>;
}
