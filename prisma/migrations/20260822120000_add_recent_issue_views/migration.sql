CREATE TABLE "RecentIssueView" (
  "userId" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecentIssueView_pkey" PRIMARY KEY ("userId", "issueId")
);
CREATE INDEX "RecentIssueView_workspaceId_userId_viewedAt_idx" ON "RecentIssueView"("workspaceId", "userId", "viewedAt");
ALTER TABLE "RecentIssueView" ADD CONSTRAINT "RecentIssueView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecentIssueView" ADD CONSTRAINT "RecentIssueView_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecentIssueView" ADD CONSTRAINT "RecentIssueView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
