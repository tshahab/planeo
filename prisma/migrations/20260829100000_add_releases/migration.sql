CREATE TYPE "ReleaseStatus" AS ENUM ('PLANNED', 'RELEASED');

CREATE TABLE "Release" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "ReleaseStatus" NOT NULL DEFAULT 'PLANNED',
  "startsAt" TIMESTAMP(3),
  "releaseDate" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IssueRelease" (
  "releaseId" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IssueRelease_pkey" PRIMARY KEY ("releaseId", "issueId")
);

CREATE UNIQUE INDEX "Release_projectId_name_key" ON "Release"("projectId", "name");
CREATE INDEX "Release_projectId_archivedAt_releaseDate_idx" ON "Release"("projectId", "archivedAt", "releaseDate");
CREATE INDEX "IssueRelease_issueId_idx" ON "IssueRelease"("issueId");
ALTER TABLE "Release" ADD CONSTRAINT "Release_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueRelease" ADD CONSTRAINT "IssueRelease_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueRelease" ADD CONSTRAINT "IssueRelease_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
