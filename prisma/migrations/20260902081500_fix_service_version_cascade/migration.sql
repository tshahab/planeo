ALTER TABLE "ServiceRequestTypeVersion" DROP CONSTRAINT "ServiceRequestTypeVersion_requestTypeId_fkey";
ALTER TABLE "ServiceRequestTypeVersion" ADD CONSTRAINT "ServiceRequestTypeVersion_requestTypeId_fkey" FOREIGN KEY ("requestTypeId") REFERENCES "ServiceRequestType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
