CREATE TABLE "PortfolioHealthSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "report" JSONB NOT NULL,
  CONSTRAINT "PortfolioHealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortfolioHealthSnapshot_planId_capturedAt_idx" ON "PortfolioHealthSnapshot"("planId", "capturedAt");
CREATE INDEX "PortfolioHealthSnapshot_workspaceId_capturedAt_idx" ON "PortfolioHealthSnapshot"("workspaceId", "capturedAt");
ALTER TABLE "PortfolioHealthSnapshot" ADD CONSTRAINT "PortfolioHealthSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioHealthSnapshot" ADD CONSTRAINT "PortfolioHealthSnapshot_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PortfolioPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioHealthSnapshot" ADD CONSTRAINT "PortfolioHealthSnapshot_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
