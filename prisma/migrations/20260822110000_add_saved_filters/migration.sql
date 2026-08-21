CREATE TABLE "SavedFilter" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query" JSONB NOT NULL,
  "shared" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SavedFilter_workspaceId_ownerId_name_key" ON "SavedFilter"("workspaceId", "ownerId", "name");
CREATE INDEX "SavedFilter_workspaceId_shared_updatedAt_idx" ON "SavedFilter"("workspaceId", "shared", "updatedAt");
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
