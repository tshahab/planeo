CREATE TABLE "AuditChainAnchor" ("workspaceId" TEXT NOT NULL,"sequence" BIGINT NOT NULL,"eventHash" TEXT NOT NULL,"anchoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AuditChainAnchor_pkey" PRIMARY KEY ("workspaceId"));
ALTER TABLE "AuditChainAnchor" ADD CONSTRAINT "AuditChainAnchor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE OR REPLACE FUNCTION planeo_audit_chain() RETURNS trigger AS $$ DECLARE prior TEXT; next_sequence BIGINT; BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW."workspaceId"));
  SELECT "eventHash","sequence"+1 INTO prior,next_sequence FROM "AuditEvent" WHERE "workspaceId"=NEW."workspaceId" ORDER BY "sequence" DESC NULLS LAST,"createdAt" DESC,"id" DESC LIMIT 1;
  IF next_sequence IS NULL THEN SELECT "eventHash","sequence"+1 INTO prior,next_sequence FROM "AuditChainAnchor" WHERE "workspaceId"=NEW."workspaceId"; END IF;
  NEW."sequence":=COALESCE(next_sequence,1); NEW."previousHash":=prior;
  NEW."eventHash":=encode(digest(concat_ws('|',NEW."workspaceId",NEW."sequence",COALESCE(NEW."previousHash",''),NEW."keyVersion",NEW."id",COALESCE(NEW."actorId",''),NEW."action",NEW."targetType",COALESCE(NEW."targetId",''),COALESCE(NEW."metadata"::text,'null'),NEW."createdAt"::text),'sha256'),'hex'); RETURN NEW;
END $$ LANGUAGE plpgsql;
