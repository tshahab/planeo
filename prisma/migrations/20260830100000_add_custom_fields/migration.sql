CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SINGLE_SELECT', 'MULTI_SELECT', 'USER', 'URL');

CREATE TABLE "CustomField" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "CustomFieldType" NOT NULL,
  "options" JSONB,
  "defaultValue" JSONB,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomField_workspaceId_name_key" ON "CustomField"("workspaceId", "name");
CREATE INDEX "CustomField_workspaceId_archivedAt_idx" ON "CustomField"("workspaceId", "archivedAt");
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomFieldProject" (
  "fieldId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "issueTypeIds" JSONB,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CustomFieldProject_pkey" PRIMARY KEY ("fieldId", "projectId")
);
CREATE INDEX "CustomFieldProject_projectId_position_idx" ON "CustomFieldProject"("projectId", "position");
ALTER TABLE "CustomFieldProject" ADD CONSTRAINT "CustomFieldProject_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldProject" ADD CONSTRAINT "CustomFieldProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomFieldValue" (
  "fieldId" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("fieldId", "issueId")
);
CREATE INDEX "CustomFieldValue_workspaceId_projectId_fieldId_idx" ON "CustomFieldValue"("workspaceId", "projectId", "fieldId");
CREATE INDEX "CustomFieldValue_issueId_idx" ON "CustomFieldValue"("issueId");
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
