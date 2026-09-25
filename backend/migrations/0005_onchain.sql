BEGIN;
-- Additive, private, append-only. No runtime grants to PUBLIC, no auto migration.
CREATE TABLE pactra.onchain_bindings (
 task_id uuid PRIMARY KEY REFERENCES pactra.tasks(id),
 chain_id numeric(78,0) NOT NULL CHECK(chain_id>0),
 escrow_address text NOT NULL CHECK(escrow_address ~ '^0x[0-9a-f]{40}$'),
 onchain_task_id numeric(78,0) NOT NULL CHECK(onchain_task_id>=0),
 proof_json text NOT NULL CHECK(jsonb_typeof(proof_json::jsonb)='object'),
 UNIQUE(chain_id,escrow_address,onchain_task_id)
);
CREATE TABLE pactra.availability_attestations (
 task_id uuid NOT NULL REFERENCES pactra.onchain_bindings(task_id),
 deliverable_id text NOT NULL,
 round integer NOT NULL CHECK(round BETWEEN 1 AND 6),
 artifact_hash text NOT NULL CHECK(artifact_hash ~ '^[0-9a-f]{64}$'),
 expiry bigint NOT NULL CHECK(expiry>0),
 response_json text NOT NULL CHECK(jsonb_typeof(response_json::jsonb)='object'),
 PRIMARY KEY(task_id,deliverable_id,round,expiry)
);
CREATE TRIGGER onchain_bindings_immutable BEFORE UPDATE OR DELETE ON pactra.onchain_bindings FOR EACH ROW EXECUTE FUNCTION pactra.guard_delivery_history();
CREATE TRIGGER onchain_bindings_no_truncate BEFORE TRUNCATE ON pactra.onchain_bindings FOR EACH STATEMENT EXECUTE FUNCTION pactra.guard_delivery_history();
CREATE TRIGGER availability_immutable BEFORE UPDATE OR DELETE ON pactra.availability_attestations FOR EACH ROW EXECUTE FUNCTION pactra.guard_delivery_history();
CREATE TRIGGER availability_no_truncate BEFORE TRUNCATE ON pactra.availability_attestations FOR EACH STATEMENT EXECUTE FUNCTION pactra.guard_delivery_history();
REVOKE ALL ON pactra.onchain_bindings,pactra.availability_attestations FROM PUBLIC;
COMMIT;
-- Operator grants runtime SELECT,INSERT on these two tables after review.
