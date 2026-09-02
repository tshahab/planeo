-- Read the final transaction state (including custom fields and labels), not an
-- intermediate issue UPDATE before the rest of the atomic edit has completed.
DROP TRIGGER "Issue_sla_capture" ON "Issue";
CREATE CONSTRAINT TRIGGER "Issue_sla_capture" AFTER UPDATE ON "Issue" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "sla_issue_changed"();
DROP TRIGGER "ServiceRequest_sla_created" ON "ServiceRequest";
CREATE CONSTRAINT TRIGGER "ServiceRequest_sla_created" AFTER INSERT ON "ServiceRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "sla_request_changed"();
DROP TRIGGER "ServiceRequest_sla_reclassified" ON "ServiceRequest";
CREATE CONSTRAINT TRIGGER "ServiceRequest_sla_reclassified" AFTER UPDATE ON "ServiceRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD."requestTypeId" IS DISTINCT FROM NEW."requestTypeId" OR OLD."customerOrganizationId" IS DISTINCT FROM NEW."customerOrganizationId") EXECUTE FUNCTION "sla_request_changed"();
CREATE FUNCTION "sla_customer_replied"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM "capture_sla_signal"((SELECT "issueId" FROM "ServiceRequest" WHERE id = NEW."requestId"), 'customer.replied'); RETURN NEW; END $$;
CREATE CONSTRAINT TRIGGER "PortalComment_sla_capture" AFTER INSERT ON "PortalComment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "sla_customer_replied"();
