ALTER TYPE "ProjectTemplate" ADD VALUE 'SERVICE';
CREATE TYPE "RequestTypeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "PortalGroup" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PortalGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PortalGroup_projectId_name_key" ON "PortalGroup"("projectId", "name");
CREATE INDEX "PortalGroup_projectId_position_idx" ON "PortalGroup"("projectId", "position");

CREATE TABLE "RequestType" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "portalGroupId" TEXT,
  "issueTypeId" TEXT NOT NULL,
  "initialStatusId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "status" "RequestTypeStatus" NOT NULL DEFAULT 'DRAFT',
  "draftSchema" JSONB NOT NULL,
  "publishedVersion" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequestType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RequestType_projectId_name_key" ON "RequestType"("projectId", "name");
CREATE INDEX "RequestType_projectId_status_position_idx" ON "RequestType"("projectId", "status", "position");
CREATE INDEX "RequestType_portalGroupId_position_idx" ON "RequestType"("portalGroupId", "position");

CREATE TABLE "RequestTypeVersion" (
  "id" TEXT NOT NULL,
  "requestTypeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "schema" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestTypeVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RequestTypeVersion_requestTypeId_version_key" ON "RequestTypeVersion"("requestTypeId", "version");
CREATE INDEX "RequestTypeVersion_requestTypeId_publishedAt_idx" ON "RequestTypeVersion"("requestTypeId", "publishedAt");

ALTER TABLE "Issue" ADD COLUMN "requestTypeVersionId" TEXT;
CREATE INDEX "Issue_requestTypeVersionId_idx" ON "Issue"("requestTypeVersionId");
ALTER TABLE "PortalGroup" ADD CONSTRAINT "PortalGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestType" ADD CONSTRAINT "RequestType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestType" ADD CONSTRAINT "RequestType_portalGroupId_fkey" FOREIGN KEY ("portalGroupId") REFERENCES "PortalGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequestType" ADD CONSTRAINT "RequestType_issueTypeId_fkey" FOREIGN KEY ("issueTypeId") REFERENCES "IssueType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestType" ADD CONSTRAINT "RequestType_initialStatusId_fkey" FOREIGN KEY ("initialStatusId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestTypeVersion" ADD CONSTRAINT "RequestTypeVersion_requestTypeId_fkey" FOREIGN KEY ("requestTypeId") REFERENCES "RequestType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_requestTypeVersionId_fkey" FOREIGN KEY ("requestTypeVersionId") REFERENCES "RequestTypeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
