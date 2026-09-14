CREATE OR REPLACE FUNCTION "sla_customer_replied"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "capture_sla_signal"((SELECT "issueId" FROM "ServiceRequest" WHERE id = NEW."requestId"), CASE WHEN NEW."agentId" IS NULL THEN 'customer.replied' ELSE 'agent.replied' END);
  RETURN NEW;
END $$;
