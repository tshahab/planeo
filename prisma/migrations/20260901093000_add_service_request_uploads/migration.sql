CREATE TABLE "ServiceRequestUpload" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "requestTypeId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL, "fileName" TEXT NOT NULL, "objectKey" TEXT NOT NULL, "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceRequestUpload_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceRequestUpload_objectKey_key" ON "ServiceRequestUpload"("objectKey");
CREATE INDEX "ServiceRequestUpload_workspaceId_uploadedById_expiresAt_usedAt_idx" ON "ServiceRequestUpload"("workspaceId", "uploadedById", "expiresAt", "usedAt");
ALTER TABLE "ServiceRequestUpload" ADD CONSTRAINT "ServiceRequestUpload_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceRequestUpload" ADD CONSTRAINT "ServiceRequestUpload_requestTypeId_fkey" FOREIGN KEY ("requestTypeId") REFERENCES "ServiceRequestType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceRequestUpload" ADD CONSTRAINT "ServiceRequestUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
