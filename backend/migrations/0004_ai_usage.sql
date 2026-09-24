BEGIN;
-- Durable admission counters only: no provider content, payment or task state.
CREATE TABLE pactra.ai_usage_global (
 usage_day date PRIMARY KEY,
 count integer NOT NULL CHECK(count BETWEEN 1 AND 1000)
);
CREATE TABLE pactra.ai_usage_wallet (
 usage_day date NOT NULL,
 address text NOT NULL REFERENCES pactra.accounts(address),
 count integer NOT NULL CHECK(count BETWEEN 1 AND 100),
 PRIMARY KEY(usage_day,address)
);
REVOKE ALL ON pactra.ai_usage_global, pactra.ai_usage_wallet FROM PUBLIC;
-- Sessions/challenges already have expiry indexes in migration 0001.
CREATE INDEX challenge_limits_window_start_idx ON pactra.challenge_limits(window_start);
COMMIT;
