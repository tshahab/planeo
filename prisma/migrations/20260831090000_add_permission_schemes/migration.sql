ALTER TABLE "Project" ADD COLUMN "permissionSchemeVersionId" TEXT;
ALTER TABLE "Issue" ADD COLUMN "securityLevelId" TEXT;

CREATE TABLE "PermissionScheme" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PermissionScheme_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PermissionSchemeVersion" (
  "id" TEXT NOT NULL, "schemeId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "permissions" JSONB NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PermissionSchemeVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "IssueSecurityLevel" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT, "grants" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IssueSecurityLevel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PermissionScheme_workspaceId_name_key" ON "PermissionScheme"("workspaceId", "name");
CREATE UNIQUE INDEX "PermissionSchemeVersion_schemeId_version_key" ON "PermissionSchemeVersion"("schemeId", "version");
CREATE UNIQUE INDEX "IssueSecurityLevel_projectId_name_key" ON "IssueSecurityLevel"("projectId", "name");
CREATE INDEX "Project_permissionSchemeVersionId_idx" ON "Project"("permissionSchemeVersionId");
CREATE INDEX "Issue_securityLevelId_idx" ON "Issue"("securityLevelId");
ALTER TABLE "PermissionScheme" ADD CONSTRAINT "PermissionScheme_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermissionSchemeVersion" ADD CONSTRAINT "PermissionSchemeVersion_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "PermissionScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueSecurityLevel" ADD CONSTRAINT "IssueSecurityLevel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_permissionSchemeVersionId_fkey" FOREIGN KEY ("permissionSchemeVersionId") REFERENCES "PermissionSchemeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_securityLevelId_fkey" FOREIGN KEY ("securityLevelId") REFERENCES "IssueSecurityLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
