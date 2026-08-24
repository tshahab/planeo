ALTER TABLE "Project" ADD COLUMN "defaultPriority" "Priority" NOT NULL DEFAULT 'MEDIUM';
CREATE TABLE "WorkflowTransition" ("id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "fromStatusId" TEXT NOT NULL, "toStatusId" TEXT NOT NULL, CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "WorkflowTransition_projectId_fromStatusId_toStatusId_key" ON "WorkflowTransition"("projectId", "fromStatusId", "toStatusId");
CREATE INDEX "WorkflowTransition_fromStatusId_idx" ON "WorkflowTransition"("fromStatusId");
CREATE INDEX "WorkflowTransition_toStatusId_idx" ON "WorkflowTransition"("toStatusId");
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "Status"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "Status"("id") ON DELETE CASCADE ON UPDATE CASCADE;
