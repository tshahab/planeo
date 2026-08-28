CREATE TABLE "IssueImport" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IssueImport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ImportedIssue" (
  "projectId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  CONSTRAINT "ImportedIssue_pkey" PRIMARY KEY ("projectId", "externalId")
);
CREATE UNIQUE INDEX "IssueImport_projectId_idempotencyKey_key" ON "IssueImport"("projectId", "idempotencyKey");
CREATE INDEX "IssueImport_projectId_createdAt_idx" ON "IssueImport"("projectId", "createdAt");
CREATE UNIQUE INDEX "ImportedIssue_issueId_key" ON "ImportedIssue"("issueId");
CREATE INDEX "ImportedIssue_importId_idx" ON "ImportedIssue"("importId");
ALTER TABLE "IssueImport" ADD CONSTRAINT "IssueImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportedIssue" ADD CONSTRAINT "ImportedIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportedIssue" ADD CONSTRAINT "ImportedIssue_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
