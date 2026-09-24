BEGIN;
-- A record exists only for a committed creation. Requests with the same buyer
-- and key serialize using a transaction-scoped advisory lock in the handler.
CREATE TABLE pactra.task_idempotency (
 buyer text NOT NULL REFERENCES pactra.accounts(address),
 key uuid NOT NULL,
 request_hash bytea NOT NULL CHECK(octet_length(request_hash)=32),
 task_id uuid NOT NULL REFERENCES pactra.tasks(id),
 response_status smallint NOT NULL CHECK(response_status=201),
 response_body bytea NOT NULL,
 PRIMARY KEY (buyer,key)
);
REVOKE ALL ON pactra.task_idempotency FROM PUBLIC;
CREATE INDEX tasks_buyer_page ON pactra.tasks(buyer,created_at DESC,id DESC);
CREATE INDEX tasks_worker_page ON pactra.tasks(worker,created_at DESC,id DESC);
COMMIT;
