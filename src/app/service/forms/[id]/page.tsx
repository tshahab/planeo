import { ServiceRequestForm } from "@/components/service-request-form";

export default async function ServiceFormPage({ params }: { params: Promise<{ id: string }> }) {
  return <ServiceRequestForm requestTypeId={(await params).id} />;
}
