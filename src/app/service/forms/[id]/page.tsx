import { ServiceRequestForm } from "@/components/service-request-form";
import { getAuthContext } from "@/lib/auth";
import { getPortalContext, portalProjectWhere } from "@/lib/portal-auth";
import { db } from "@/lib/db";

export default async function ServiceFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAuthContext(); const portal = agent ? null : await getPortalContext();
  const type = portal ? await db.serviceRequestType.findFirst({ where: { id, project: portalProjectWhere(portal) }, select: { projectId: true } }) : null;
  const organizations = portal && type ? await db.customerOrganization.findMany({ where: { workspaceId: portal.workspace.id, members: { some: { customerId: portal.customer.id, active: true } }, projects: { some: { projectId: type.projectId, enabled: true } } }, select: { id: true, name: true } }) : [];
  return <ServiceRequestForm requestTypeId={id} portalWorkspace={portal?.workspace.slug} organizations={organizations} />;
}
