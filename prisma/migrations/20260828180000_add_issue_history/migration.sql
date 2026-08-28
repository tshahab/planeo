CREATE TABLE "IssueHistory" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "sprintId" TEXT,
  "event" TEXT NOT NULL,
  "statusCategory" "StatusCategory" NOT NULL,
  "estimate" INTEGER,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IssueHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IssueHistory_projectId_occurredAt_idx" ON "IssueHistory"("projectId", "occurredAt");
CREATE INDEX "IssueHistory_sprintId_occurredAt_idx" ON "IssueHistory"("sprintId", "occurredAt");
CREATE INDEX "IssueHistory_issueId_occurredAt_idx" ON "IssueHistory"("issueId", "occurredAt");
ALTER TABLE "IssueHistory" ADD CONSTRAINT "IssueHistory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueHistory" ADD CONSTRAINT "IssueHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueHistory" ADD CONSTRAINT "IssueHistory_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "IssueHistory" (id, "workspaceId", "projectId", "issueId", event, "statusCategory", estimate, "occurredAt")
SELECT 'backfill-' || issue.id, issue."workspaceId", issue."projectId", issue.id, 'BASELINE', status.category, issue.estimate, issue."createdAt"
FROM "Issue" issue JOIN "Status" status ON status.id = issue."statusId";
