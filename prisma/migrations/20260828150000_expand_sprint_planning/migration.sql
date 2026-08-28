ALTER TABLE "Sprint" ADD COLUMN "totalEstimate" INTEGER,
ADD COLUMN "completedEstimate" INTEGER,
ADD COLUMN "capacityTarget" INTEGER,
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

WITH ranked AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY "projectId", state ORDER BY "createdAt") - 1 AS position FROM "Sprint")
UPDATE "Sprint" SET position = ranked.position FROM ranked WHERE "Sprint".id = ranked.id;

CREATE UNIQUE INDEX "Sprint_one_active_per_project" ON "Sprint"("projectId") WHERE state = 'ACTIVE';
CREATE INDEX "Sprint_projectId_state_position_idx" ON "Sprint"("projectId", state, position);
DROP INDEX IF EXISTS "Sprint_projectId_state_idx";

CREATE TABLE "SprintSnapshotIssue" (
  "sprintId" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "issueKey" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "estimate" INTEGER,
  "completed" BOOLEAN NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "SprintSnapshotIssue_pkey" PRIMARY KEY ("sprintId", "issueId")
);
CREATE INDEX "SprintSnapshotIssue_sprintId_completed_idx" ON "SprintSnapshotIssue"("sprintId", "completed");
ALTER TABLE "SprintSnapshotIssue" ADD CONSTRAINT "SprintSnapshotIssue_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
