ALTER TABLE "ServiceRequest" ADD COLUMN "slaState" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_slaState_check" CHECK ("slaState" IN ('NONE','RUNNING','PAUSED','AT_RISK','BREACHED','MET'));
CREATE TABLE "ServiceQueue" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "visibility" TEXT NOT NULL DEFAULT 'PRIVATE', "definition" JSONB NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0, "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceQueue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceQueue_visibility_check" CHECK ("visibility" IN ('PRIVATE','TEAM'))
);
CREATE INDEX "ServiceQueue_projectId_visibility_position_idx" ON "ServiceQueue"("projectId","visibility","position");
CREATE UNIQUE INDEX "ServiceQueue_team_default" ON "ServiceQueue"("projectId") WHERE "isDefault" AND "visibility" = 'TEAM';
CREATE UNIQUE INDEX "ServiceQueue_private_default" ON "ServiceQueue"("projectId","ownerId") WHERE "isDefault" AND "visibility" = 'PRIVATE';
CREATE TABLE "ServiceQueueSnapshot" (
  "id" TEXT PRIMARY KEY, "queueId" TEXT NOT NULL, "queueVersion" INTEGER NOT NULL,
  "userId" TEXT NOT NULL, "rows" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceQueueSnapshot_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "ServiceQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ServiceQueueSnapshot_queueId_userId_expiresAt_idx" ON "ServiceQueueSnapshot"("queueId","userId","expiresAt");
