CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "DomainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REVOKED');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "allowedDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowAccountLinking" BOOLEAN NOT NULL DEFAULT false,
  "restrictInvitations" BOOLEAN NOT NULL DEFAULT false,
  "enforceSso" BOOLEAN NOT NULL DEFAULT false,
  "allowLocalLogin" BOOLEAN NOT NULL DEFAULT true,
  "allowJitProvisioning" BOOLEAN NOT NULL DEFAULT false,
  "sessionLifetimeMinutes" INTEGER NOT NULL DEFAULT 10080,
  "privilegedReauthMinutes" INTEGER NOT NULL DEFAULT 15,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

CREATE TABLE "OrganizationMember" (
  "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
  "breakGlass" BOOLEAN NOT NULL DEFAULT false,
  "recoveryConfirmedAt" TIMESTAMP(3), "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivatedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("organizationId", "userId")
);
CREATE INDEX "OrganizationMember_userId_deactivatedAt_idx" ON "OrganizationMember"("userId", "deactivatedAt");

CREATE TABLE "OrganizationDomain" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "domain" TEXT NOT NULL,
  "status" "DomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "challengeHash" TEXT NOT NULL, "challengeExpiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3), "verifiedChallengeHash" TEXT, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationDomain_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationDomain_domain_key" ON "OrganizationDomain"("domain");
CREATE INDEX "OrganizationDomain_organizationId_status_idx" ON "OrganizationDomain"("organizationId", "status");
CREATE INDEX "OrganizationDomain_challengeExpiresAt_idx" ON "OrganizationDomain"("challengeExpiresAt");

ALTER TABLE "Workspace" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationDomain" ADD CONSTRAINT "OrganizationDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
