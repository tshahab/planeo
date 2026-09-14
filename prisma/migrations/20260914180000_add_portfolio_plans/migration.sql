CREATE TABLE "PortfolioPlan" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "description" TEXT, "shared" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1, "configuration" JSONB NOT NULL,
  "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PortfolioPlan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PortfolioPlanSource" (
  "id" TEXT NOT NULL, "planId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "projectId" TEXT, "query" TEXT, CONSTRAINT "PortfolioPlanSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PortfolioPlan_workspaceId_ownerId_name_key" ON "PortfolioPlan"("workspaceId","ownerId","name");
CREATE INDEX "PortfolioPlan_workspaceId_shared_updatedAt_idx" ON "PortfolioPlan"("workspaceId","shared","updatedAt");
CREATE INDEX "PortfolioPlanSource_planId_idx" ON "PortfolioPlanSource"("planId");
CREATE INDEX "PortfolioPlanSource_projectId_idx" ON "PortfolioPlanSource"("projectId");
ALTER TABLE "PortfolioPlan" ADD CONSTRAINT "PortfolioPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioPlan" ADD CONSTRAINT "PortfolioPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioPlanSource" ADD CONSTRAINT "PortfolioPlanSource_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PortfolioPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioPlanSource" ADD CONSTRAINT "PortfolioPlanSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
