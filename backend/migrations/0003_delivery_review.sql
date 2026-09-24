BEGIN;
-- Append-only voluntary review evidence. The parent task row is the lock and
-- eligibility boundary: no delivery code changes task.status or manifest.
CREATE TABLE pactra.delivery_events (
 task_id uuid NOT NULL REFERENCES pactra.tasks(id),
 deliverable_id text NOT NULL CHECK(deliverable_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(deliverable_id)<=64),
 kind text NOT NULL CHECK(kind IN ('submission','review','dispute')),
 version integer NOT NULL CHECK(version BETWEEN 1 AND 6),
 actor text NOT NULL REFERENCES pactra.accounts(address),
 artifact_hash text NOT NULL CHECK(artifact_hash ~ '^[0-9a-f]{64}$'),
 manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[0-9a-f]{64}$'),
 event_json text NOT NULL CHECK(jsonb_typeof(event_json::jsonb)='object'),
 PRIMARY KEY(task_id,deliverable_id,kind,version)
);
CREATE UNIQUE INDEX delivery_one_dispute ON pactra.delivery_events(task_id,deliverable_id) WHERE kind='dispute';
CREATE TABLE pactra.delivery_idempotency (
 task_id uuid NOT NULL REFERENCES pactra.tasks(id),
 deliverable_id text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('submissions','reviews','disputes')),
 actor text NOT NULL REFERENCES pactra.accounts(address),
 idempotency_key uuid NOT NULL,
 canonical_payload text NOT NULL CHECK(jsonb_typeof(canonical_payload::jsonb)='object'),
 response_json text NOT NULL CHECK(jsonb_typeof(response_json::jsonb)='object'),
 PRIMARY KEY(task_id,deliverable_id,operation,actor,idempotency_key)
);
CREATE FUNCTION pactra.guard_delivery_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'immutable delivery history';
END $$;
CREATE TRIGGER delivery_events_immutable BEFORE UPDATE OR DELETE ON pactra.delivery_events
 FOR EACH ROW EXECUTE FUNCTION pactra.guard_delivery_history();
CREATE TRIGGER delivery_events_no_truncate BEFORE TRUNCATE ON pactra.delivery_events
 FOR EACH STATEMENT EXECUTE FUNCTION pactra.guard_delivery_history();
CREATE TRIGGER delivery_idempotency_immutable BEFORE UPDATE OR DELETE ON pactra.delivery_idempotency
 FOR EACH ROW EXECUTE FUNCTION pactra.guard_delivery_history();
CREATE TRIGGER delivery_idempotency_no_truncate BEFORE TRUNCATE ON pactra.delivery_idempotency
 FOR EACH STATEMENT EXECUTE FUNCTION pactra.guard_delivery_history();
REVOKE ALL ON pactra.delivery_events,pactra.delivery_idempotency FROM PUBLIC;
REVOKE ALL ON FUNCTION pactra.guard_delivery_history() FROM PUBLIC;
COMMIT;
