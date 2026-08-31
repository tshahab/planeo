CREATE TABLE "ScimToken" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL, "prefix" TEXT NOT NULL, "secretHash" TEXT NOT NULL, "scopes" TEXT[] NOT NULL,
  "expiresAt" TIMESTAMP(3), "lastUsedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ScimToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScimToken_prefix_key" ON "ScimToken"("prefix");
CREATE UNIQUE INDEX "ScimToken_secretHash_key" ON "ScimToken"("secretHash");
CREATE INDEX "ScimToken_organizationId_revokedAt_createdAt_idx" ON "ScimToken"("organizationId", "revokedAt", "createdAt");

CREATE TABLE "ScimIdentity" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "externalId" TEXT,
  "userName" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScimIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScimIdentity_organizationId_userId_key" ON "ScimIdentity"("organizationId", "userId");
CREATE UNIQUE INDEX "ScimIdentity_organizationId_userName_key" ON "ScimIdentity"("organizationId", "userName");
CREATE UNIQUE INDEX "ScimIdentity_organizationId_externalId_key" ON "ScimIdentity"("organizationId", "externalId");
CREATE INDEX "ScimIdentity_userId_idx" ON "ScimIdentity"("userId");

CREATE TABLE "OrganizationGroup" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "externalId" TEXT, "displayName" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "OrganizationGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationGroup_organizationId_displayName_key" ON "OrganizationGroup"("organizationId", "displayName");
CREATE UNIQUE INDEX "OrganizationGroup_organizationId_externalId_key" ON "OrganizationGroup"("organizationId", "externalId");
CREATE INDEX "OrganizationGroup_organizationId_updatedAt_idx" ON "OrganizationGroup"("organizationId", "updatedAt");

CREATE TABLE "OrganizationGroupMember" (
  "groupId" TEXT NOT NULL, "scimIdentityId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationGroupMember_pkey" PRIMARY KEY ("groupId", "scimIdentityId")
);
CREATE INDEX "OrganizationGroupMember_scimIdentityId_idx" ON "OrganizationGroupMember"("scimIdentityId");

CREATE TABLE "ScimGroupMapping" (
  "id" TEXT NOT NULL, "groupId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT,
  "role" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScimGroupMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScimGroupMapping_groupId_workspaceId_projectId_role_key" ON "ScimGroupMapping"("groupId", "workspaceId", "projectId", "role");
CREATE INDEX "ScimGroupMapping_workspaceId_projectId_idx" ON "ScimGroupMapping"("workspaceId", "projectId");

CREATE TABLE "ScimProvisioningLog" (
  "id" BIGSERIAL NOT NULL, "organizationId" TEXT NOT NULL, "tokenId" TEXT, "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL, "resourceId" TEXT, "status" INTEGER NOT NULL, "errorCode" TEXT,
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScimProvisioningLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScimProvisioningLog_organizationId_createdAt_idx" ON "ScimProvisioningLog"("organizationId", "createdAt");

ALTER TABLE "ScimToken" ADD CONSTRAINT "ScimToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScimToken" ADD CONSTRAINT "ScimToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScimIdentity" ADD CONSTRAINT "ScimIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScimIdentity" ADD CONSTRAINT "ScimIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationGroup" ADD CONSTRAINT "OrganizationGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationGroupMember" ADD CONSTRAINT "OrganizationGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OrganizationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationGroupMember" ADD CONSTRAINT "OrganizationGroupMember_scimIdentityId_fkey" FOREIGN KEY ("scimIdentityId") REFERENCES "ScimIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScimGroupMapping" ADD CONSTRAINT "ScimGroupMapping_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OrganizationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScimProvisioningLog" ADD CONSTRAINT "ScimProvisioningLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
