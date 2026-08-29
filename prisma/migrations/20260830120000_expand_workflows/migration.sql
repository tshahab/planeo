ALTER TABLE "Issue" ADD COLUMN "resolution" TEXT;
ALTER TABLE "WorkflowTransition" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Transition', ADD COLUMN "description" TEXT, ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "conditions" JSONB, ADD COLUMN "validators" JSONB, ADD COLUMN "actions" JSONB, ADD COLUMN "workflowVersion" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "WorkflowVersion" ("id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "version" INTEGER NOT NULL, "configuration" JSONB NOT NULL, "createdById" TEXT NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "WorkflowVersion_projectId_version_key" ON "WorkflowVersion"("projectId", "version");
CREATE INDEX "WorkflowVersion_projectId_publishedAt_idx" ON "WorkflowVersion"("projectId", "publishedAt");
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
