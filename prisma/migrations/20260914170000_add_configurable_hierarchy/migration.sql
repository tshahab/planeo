CREATE TABLE "HierarchyLevel" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HierarchyLevel_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Issue" ADD COLUMN "hierarchyLevelId" TEXT;
CREATE UNIQUE INDEX "HierarchyLevel_workspaceId_name_key" ON "HierarchyLevel"("workspaceId", "name");
CREATE UNIQUE INDEX "HierarchyLevel_workspaceId_position_key" ON "HierarchyLevel"("workspaceId", "position");
CREATE INDEX "HierarchyLevel_workspaceId_archivedAt_position_idx" ON "HierarchyLevel"("workspaceId", "archivedAt", "position");
CREATE INDEX "Issue_workspaceId_hierarchyLevelId_idx" ON "Issue"("workspaceId", "hierarchyLevelId");
CREATE INDEX "Issue_parentId_idx" ON "Issue"("parentId");
ALTER TABLE "HierarchyLevel" ADD CONSTRAINT "HierarchyLevel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_hierarchyLevelId_fkey" FOREIGN KEY ("hierarchyLevelId") REFERENCES "HierarchyLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
