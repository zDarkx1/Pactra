# Task reliability outcome

Implemented on `feature/non-contract-workspace`, restricted to:

- `backend/internal/workspace/tasks.go`
- `backend/internal/workspace/idempotency_test.go`
- `backend/internal/workspace/pagination_test.go`
- `backend/migrations/0002_task_reliability.sql`
- This document

No commits, pushes, deployments, hosted database access, secret access, or delegation. Other agents' shared-tree changes were left untouched. No global setup/helper or `workspace.go` edits.

## Create idempotency

`POST /api/v1/tasks` accepts an optional `Idempotency-Key` header. Absence preserves independent creation and does not require the new idempotency table. A present header must be exactly one hyphenated UUID text value (8-4-4-4-12 hex digits, case-insensitive; not restricted to v4). Empty, duplicate, comma-joined, padded, or malformed values return 400. The application does not trim malformed keys.

Keys are scoped to the authenticated buyer. SHA-256 hashes the decoded request's application-canonical JSON: recursively sorted object keys, normalized valid addresses, UTC deadlines, preserved array order and string values. Server-generated creation/expiry timestamps and configuration are excluded. This is application canonicalization, not JCS. Invalid JSON/types/unknown fields still fail strict decoding with 400. A different successfully decoded request for an existing key returns 409, including when current manifest validation would reject it.

A PostgreSQL transaction-scoped advisory lock derived from buyer + key serializes concurrent requests across independent connections and server instances. The full `(buyer,key)` primary key remains authoritative; a lock-hash collision can only delay unrelated requests. Lookup occurs after locking and before time-dependent or arbiter-policy validation. The normal default PostgreSQL READ COMMITTED isolation is assumed, so the lookup after a waiting lock sees the preceding commit.

The task and its idempotency record commit in the same transaction. The record stores the canonical request hash, task reference, original HTTP status (201), and exact original JSON response bytes, including the newline. Failures before commit leave neither an orphan task nor a reserved key. A lost response or ambiguous commit can be recovered by retrying the same key and payload.

Retries return the original 201 response, not a reconstruction from the current task. Therefore a create replay can correctly say `invited` after the worker has accepted; GET returns the current `accepted_unfunded` status. Recovery works even when the deadline no longer satisfies the creation window or arbiter configuration has changed. Authentication is still mandatory. Lock contention remains bounded by the existing request timeout; a 503 can be retried with the same key.

No automatic key expiry/deletion is added. Durable recovery requires retaining these records. They contain task-response data and must receive the same backup/access treatment as tasks.

## Participant cursor pagination

`GET /api/v1/tasks?limit=1&cursor=<opaque-token>` returns:

    {"tasks":[...],"next_cursor":null}

`next_cursor` is a nonempty string only when a lookahead row exists. Omit cursor for the first page. Limit defaults to 50 and accepts canonical decimal integers 1 through 50. Empty/duplicate/invalid limits or cursors, invalid URL escapes, unsupported cursor versions, malformed timestamps/IDs/base64, and noncanonical cursor encodings return 400. Empty results are `tasks: []`, `next_cursor: null`.

Ordering is descending `(created_at,id)`, with a strict tuple boundary for continuation. This avoids offsets, breaks equal-timestamp ties deterministically, and prevents newer inserts from shifting continuation pages. The migration adds buyer/worker indexes including both ordering columns.

Cursors are versioned unpadded base64url position tokens. Clients should treat them as opaque. They are not signed or encrypted and confer no authority: every query independently enforces authenticated buyer OR worker visibility, including when a cursor comes from a different account. Arbiters have no listing access merely by being named in a task. This is keyset pagination, not a multi-request database snapshot; rows newly committed below an existing boundary can appear on a later page.

## Invariants and integration handoff

Task acceptance/cancellation code and the existing immutable-task database trigger remain unchanged. Accepted tasks stay `accepted_unfunded`; no funding, escrow, arbiters, or review evidence is invented. Test wallets/arbiter configuration are isolated fixtures only.

Parent integration must apply `0002_task_reliability.sql` after `0001_workspace.sql` before enabling keyed create requests. This work deliberately does not wire the full migration runner. Existing setup still applies only 0001; the reliability test helper applies only 0002 afterward. Neither 0003 nor 0004 is applied by these tests. A deployment missing 0002 receives 503 for keyed creation; there is no unsafe fallback to unkeyed creation.

## Actual verification

Only the user-authorized local database was used:

    TEST_DATABASE_URL=postgresql:///pactra_reliability?host=/var/run/postgresql&port=5546

The connection check returned database `pactra_reliability`, user `root`, and the local socket was accepting connections. These tests reset the `pactra` schema through existing setup; do not point them at a shared or hosted database.

Toolchain:

    /root/.local/toolchains/go1.27.1/go/bin/go version
    go version go1.27.1 linux/amd64

TDD red: after writing tests and migration, before editing the implementation, the explicit-file test run failed on concurrent duplicate creation, absent durable response, ignored malformed key, two successes for differing payloads, ignored page limits, and missing/invalid cursor behavior. The initial package-wide build was temporarily blocked by another agent's incomplete AI-budget symbols. An explicit existing-source/helper + owned-test file set established the red result without editing that agent's files. The package subsequently compiled normally.

Final focused command, run from `backend` with the local TEST_DATABASE_URL exported:

    /root/.local/toolchains/go1.27.1/go/bin/go test pactra/backend/internal/workspace -run 'Test(Idempotency|Pagination)' -race -count=3
    ok  pactra/backend/internal/workspace  5.960s

Covered test cases:

- `TestIdempotencyConcurrentCanonicalAndBuyerScope`: 16 simultaneous requests through independent pools/handlers, one task, byte-identical responses and durable record, equivalent address/timestamp/JSON formatting, payload conflict, independent buyers, and absent-key compatibility.
- `TestIdempotencyLostResponseTimeValidationAndAcceptedSnapshot`: response writer fails after commit, real clock crosses the one-hour creation-validation boundary, unkeyed request fails, fresh handler with no arbiters replays original bytes, altered payload conflicts, accepted status remains immutable. This exercises expiration of the creation-validation window; it does not wait for the full invitation/deadline to expire.
- `TestIdempotencyRejectMalformedAndRollback`: header rejection, invalid-request rollback, a real PostgreSQL trigger deliberately fails idempotency insertion after task insertion, no orphan task, subsequent retry succeeds.
- `TestIdempotencyConcurrentDifferentPayload`: one 201, one 409, one committed task.
- `TestPaginationParticipantStableTies`: equal timestamps, mixed buyer/worker/unrelated rows, complete traversal at different limits, arbiter privacy when reusing a cursor, no continuation shift after a newer insert, default/max 50 with lookahead. Fixture manifests/hashes remain consistent with their participants.
- `TestPaginationMalformedAndEmpty`: malformed limits/cursors/query encoding and explicit empty-page shape.

Final wider local workspace regression command (hosted test explicitly excluded):

    /root/.local/toolchains/go1.27.1/go/bin/go test pactra/backend/internal/workspace -skip '^TestHostedWorkspaceSmoke$' -race -count=1
    ok  pactra/backend/internal/workspace  7.882s

Static verification:

    /root/.local/toolchains/go1.27.1/go/bin/go vet pactra/backend/internal/workspace

Exited 0 with no diagnostics. Owned Go files were gofmt-formatted. `git diff --check` for the owned implementation/test/migration paths exited 0. These results verify the local workspace package, not a deployment or hosted integration.
