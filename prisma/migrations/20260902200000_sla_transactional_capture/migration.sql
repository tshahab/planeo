-- Capture all issue mutation paths, including API tokens and background bulk/automation workers.
CREATE FUNCTION "capture_sla_signal"(issue_id TEXT, event_name TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE request_row "ServiceRequest"%ROWTYPE; issue_row "Issue"%ROWTYPE; goal_ids JSONB; snapshot JSONB; event_time TIMESTAMP(3);
BEGIN
  SELECT * INTO request_row FROM "ServiceRequest" WHERE "issueId" = issue_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(jsonb_agg(v.id ORDER BY g.position, g.id), '[]'::jsonb) INTO goal_ids
    FROM "SlaGoal" g JOIN "SlaGoalVersion" v ON v."goalId" = g.id AND v.version = g."currentVersion"
    WHERE g."projectId" = request_row."projectId" AND g.enabled;
  IF jsonb_array_length(goal_ids) = 0 AND NOT EXISTS (SELECT 1 FROM "SlaCycle" WHERE "requestId" = request_row.id) THEN RETURN; END IF;
  SELECT * INTO issue_row FROM "Issue" WHERE id = issue_id;
  snapshot := jsonb_build_object('event', event_name, 'statusId', issue_row."statusId",
    'statusCategory', (SELECT category::TEXT FROM "Status" WHERE id = issue_row."statusId"),
    'requestTypeId', request_row."requestTypeId", 'priority', issue_row.priority::TEXT,
    'organizationId', COALESCE(request_row."customerOrganizationId", ''),
    'labels', (SELECT COALESCE(jsonb_agg("labelId"), '[]'::jsonb) FROM "IssueLabel" WHERE "issueId" = issue_id),
    'fields', (SELECT COALESCE(jsonb_object_agg("fieldId", value), '{}'::jsonb) FROM "CustomFieldValue" WHERE "issueId" = issue_id));
  event_time := GREATEST(clock_timestamp()::TIMESTAMP(3), request_row."slaCheckedAt", (SELECT MAX("happenedAt") FROM "SlaSignal" WHERE "requestId" = request_row.id));
  INSERT INTO "SlaSignal" ("requestId", "eventKey", "happenedAt", payload, "goalIds") VALUES (request_row.id, 'db:' || gen_random_uuid()::TEXT, event_time, snapshot, goal_ids);
END $$;
CREATE FUNCTION "sla_issue_changed"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_name TEXT := 'issue.updated';
BEGIN
  IF OLD."statusId" IS DISTINCT FROM NEW."statusId" AND (SELECT category FROM "Status" WHERE id = OLD."statusId") = 'DONE' AND (SELECT category FROM "Status" WHERE id = NEW."statusId") <> 'DONE' THEN event_name := 'request.reopened'; END IF;
  PERFORM "capture_sla_signal"(NEW.id, event_name); RETURN NEW;
END $$;
CREATE TRIGGER "Issue_sla_capture" AFTER UPDATE ON "Issue" FOR EACH ROW EXECUTE FUNCTION "sla_issue_changed"();
CREATE FUNCTION "sla_request_changed"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM "capture_sla_signal"(NEW."issueId", CASE WHEN TG_OP = 'INSERT' THEN 'issue.created' ELSE 'issue.updated' END); RETURN NEW; END $$;
CREATE TRIGGER "ServiceRequest_sla_created" AFTER INSERT ON "ServiceRequest" FOR EACH ROW EXECUTE FUNCTION "sla_request_changed"();
CREATE TRIGGER "ServiceRequest_sla_reclassified" AFTER UPDATE OF "requestTypeId", "customerOrganizationId" ON "ServiceRequest" FOR EACH ROW WHEN (OLD."requestTypeId" IS DISTINCT FROM NEW."requestTypeId" OR OLD."customerOrganizationId" IS DISTINCT FROM NEW."customerOrganizationId") EXECUTE FUNCTION "sla_request_changed"();
