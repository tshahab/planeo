CREATE TABLE "SamlConfiguration" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "entityId" TEXT NOT NULL,
  "entryPoint" TEXT NOT NULL, "idpIssuer" TEXT NOT NULL, "idpCertificates" TEXT[] NOT NULL,
  "encryptedSpPrivateKey" TEXT, "spCertificate" TEXT,
  "encryptedDecryptionPrivateKey" TEXT, "decryptionCertificate" TEXT,
  "allowIdpInitiated" BOOLEAN NOT NULL DEFAULT false, "attributeMapping" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false, "testedAt" TIMESTAMP(3), "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SamlConfiguration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SamlConfiguration_organizationId_key" ON "SamlConfiguration"("organizationId");

CREATE TABLE "SamlIdentity" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "issuer" TEXT NOT NULL, "nameId" TEXT NOT NULL, "nameIdFormat" TEXT,
  "lastLoginAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SamlIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SamlIdentity_organizationId_userId_key" ON "SamlIdentity"("organizationId", "userId");
CREATE UNIQUE INDEX "SamlIdentity_organizationId_issuer_nameId_key" ON "SamlIdentity"("organizationId", "issuer", "nameId");
CREATE INDEX "SamlIdentity_userId_idx" ON "SamlIdentity"("userId");

CREATE TABLE "SamlRequest" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "relayPath" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SamlRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SamlRequest_requestId_key" ON "SamlRequest"("requestId");
CREATE INDEX "SamlRequest_organizationId_expiresAt_idx" ON "SamlRequest"("organizationId", "expiresAt");

CREATE TABLE "SamlAssertionReplay" (
  "assertionId" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SamlAssertionReplay_pkey" PRIMARY KEY ("assertionId")
);
CREATE INDEX "SamlAssertionReplay_organizationId_expiresAt_idx" ON "SamlAssertionReplay"("organizationId", "expiresAt");

ALTER TABLE "SamlConfiguration" ADD CONSTRAINT "SamlConfiguration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SamlIdentity" ADD CONSTRAINT "SamlIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SamlIdentity" ADD CONSTRAINT "SamlIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SamlRequest" ADD CONSTRAINT "SamlRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SamlAssertionReplay" ADD CONSTRAINT "SamlAssertionReplay_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
