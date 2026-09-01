CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE "AuditEvent" ADD COLUMN "sequence" BIGINT, ADD COLUMN "previousHash" TEXT, ADD COLUMN "eventHash" TEXT, ADD COLUMN "keyVersion" INTEGER NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION planeo_audit_chain() RETURNS trigger AS $$ DECLARE prior TEXT; next_sequence BIGINT; BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW."workspaceId"));
  SELECT "eventHash","sequence"+1 INTO prior,next_sequence FROM "AuditEvent" WHERE "workspaceId"=NEW."workspaceId" ORDER BY "sequence" DESC NULLS LAST,"createdAt" DESC,"id" DESC LIMIT 1;
  NEW."sequence":=COALESCE(next_sequence,1); NEW."previousHash":=prior;
  NEW."eventHash":=encode(digest(concat_ws('|',NEW."workspaceId",NEW."sequence",COALESCE(NEW."previousHash",''),NEW."keyVersion",NEW."id",COALESCE(NEW."actorId",''),NEW."action",NEW."targetType",COALESCE(NEW."targetId",''),COALESCE(NEW."metadata"::text,'null'),NEW."createdAt"::text),'sha256'),'hex'); RETURN NEW;
END $$ LANGUAGE plpgsql;
DO $$ DECLARE item RECORD; prior TEXT; seq BIGINT:=0; digest_value TEXT; current_workspace TEXT; BEGIN FOR item IN SELECT * FROM "AuditEvent" ORDER BY "workspaceId","createdAt","id" LOOP IF current_workspace IS DISTINCT FROM item."workspaceId" THEN current_workspace:=item."workspaceId";prior:=NULL;seq:=0;END IF;seq:=seq+1;digest_value:=encode(digest(concat_ws('|',item."workspaceId",seq,COALESCE(prior,''),1,item.id,COALESCE(item."actorId",''),item.action,item."targetType",COALESCE(item."targetId",''),COALESCE(item.metadata::text,'null'),item."createdAt"::text),'sha256'),'hex');UPDATE "AuditEvent" SET "sequence"=seq,"previousHash"=prior,"eventHash"=digest_value WHERE id=item.id;prior:=digest_value;END LOOP;END $$;
ALTER TABLE "AuditEvent" ALTER COLUMN "sequence" SET NOT NULL, ALTER COLUMN "eventHash" SET NOT NULL;
CREATE UNIQUE INDEX "AuditEvent_workspaceId_sequence_key" ON "AuditEvent"("workspaceId","sequence");
CREATE TRIGGER "AuditEvent_chain_insert" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION planeo_audit_chain();
CREATE TABLE "AuditExport" ("id" TEXT NOT NULL,"workspaceId" TEXT NOT NULL,"requestedById" TEXT NOT NULL,"format" TEXT NOT NULL,"filters" JSONB NOT NULL,"status" TEXT NOT NULL DEFAULT 'PENDING',"objectKey" TEXT,"manifest" JSONB,"checksum" TEXT,"expiresAt" TIMESTAMP(3) NOT NULL,"lastError" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMP(3),CONSTRAINT "AuditExport_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AuditExport_workspaceId_createdAt_idx" ON "AuditExport"("workspaceId","createdAt");
ALTER TABLE "AuditExport" ADD CONSTRAINT "AuditExport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
