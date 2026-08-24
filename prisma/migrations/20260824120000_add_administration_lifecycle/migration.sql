ALTER TABLE "WorkspaceMember" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "leadId" TEXT;
ALTER TABLE "Project" ADD COLUMN "defaultAssigneeId" TEXT;
CREATE INDEX "Project_leadId_idx" ON "Project"("leadId");
CREATE INDEX "Project_defaultAssigneeId_idx" ON "Project"("defaultAssigneeId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultAssigneeId_fkey" FOREIGN KEY ("defaultAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
