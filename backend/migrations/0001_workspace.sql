BEGIN;
CREATE SCHEMA IF NOT EXISTS pactra;
REVOKE ALL ON SCHEMA pactra FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE TABLE pactra.accounts (
 address text PRIMARY KEY CHECK(address ~ '^0x[0-9a-f]{40}$' AND address <> '0x0000000000000000000000000000000000000000')
);
CREATE TABLE pactra.challenge_limits (
 address text PRIMARY KEY REFERENCES pactra.accounts(address),
 window_start timestamptz NOT NULL,
 count integer NOT NULL CHECK(count BETWEEN 1 AND 5)
);
CREATE TABLE pactra.challenges (
 id uuid PRIMARY KEY,
 address text NOT NULL REFERENCES pactra.accounts(address),
 message text NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed boolean NOT NULL DEFAULT false
);
CREATE INDEX ON pactra.challenges(expires_at);
CREATE TABLE pactra.sessions (
 token_hash bytea PRIMARY KEY CHECK(octet_length(token_hash)=32),
 address text NOT NULL REFERENCES pactra.accounts(address),
 audience text NOT NULL CHECK(audience <> ''),
 expires_at timestamptz NOT NULL
);
CREATE INDEX ON pactra.sessions(expires_at);
CREATE TABLE pactra.tasks (
 id uuid PRIMARY KEY,
 buyer text NOT NULL REFERENCES pactra.accounts(address),
 worker text NOT NULL REFERENCES pactra.accounts(address),
 primary_arbiter text NOT NULL REFERENCES pactra.accounts(address),
 backup_arbiter text NOT NULL REFERENCES pactra.accounts(address),
 status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','accepted_unfunded','cancelled')),
 manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object'),
 manifest_json text NOT NULL CHECK(manifest_json::jsonb=manifest),
 manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL,
 invite_expires_at timestamptz NOT NULL,
 delivery_deadline timestamptz NOT NULL,
 CHECK(buyer<>worker AND buyer<>primary_arbiter AND buyer<>backup_arbiter AND worker<>primary_arbiter AND worker<>backup_arbiter AND primary_arbiter<>backup_arbiter),
 CHECK(invite_expires_at<=delivery_deadline AND invite_expires_at>created_at AND invite_expires_at<=created_at+interval '72 hours'),
 CHECK(delivery_deadline>=created_at+interval '1 hour' AND delivery_deadline<=created_at+interval '90 days')
);
CREATE INDEX ON pactra.tasks(buyer,created_at DESC);
CREATE INDEX ON pactra.tasks(worker,created_at DESC);
CREATE INDEX ON pactra.tasks(primary_arbiter,created_at DESC);
CREATE INDEX ON pactra.tasks(backup_arbiter,created_at DESC);
CREATE FUNCTION pactra.guard_task_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR OLD.status<>'invited' OR NEW.status NOT IN ('accepted_unfunded','cancelled') THEN
 RAISE EXCEPTION 'immutable task';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_task BEFORE UPDATE ON pactra.tasks FOR EACH ROW EXECUTE FUNCTION pactra.guard_task_update();
REVOKE ALL ON ALL TABLES IN SCHEMA pactra FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pactra FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA pactra REVOKE ALL ON TABLES FROM PUBLIC;
COMMIT;
