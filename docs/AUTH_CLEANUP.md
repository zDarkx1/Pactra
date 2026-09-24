Bounded expired-auth cleanup
===========================

Owned implementation
--------------------
backend/internal/workspace/auth_cleanup.go
backend/internal/workspace/auth_cleanup_test.go
backend/migrations/0004_ai_usage.sql (challenge-window expiry index)

Public Go API
-------------
    func CleanupExpiredAuth(ctx context.Context, pool *pgxpool.Pool, limit int) (AuthCleanupResult, error)

    type AuthCleanupResult struct {
        Sessions        int64
        Challenges      int64
        ChallengeLimits int64
    }

A non-nil pool and a total batch limit from 1 through MaxAuthCleanupBatch=1000
are required. Zero is an error, not unbounded work or a hidden default. The
result reports committed deletions per table; errors return a zero result. No
background worker is launched, no HTTP endpoint is added, and pool ownership
remains with the caller. Caller must supply a context deadline and approved
scheduling. Parent-owned CLI/operations wiring is outside this implementation.

Example invocation after obtaining the application's pool:

    ctx, cancel := context.WithTimeout(parentContext, 5*time.Second)
    defer cancel()
    result, err := workspace.CleanupExpiredAuth(ctx, pool, 100)

Do not ignore err or report result as success when err is non-nil. Do not log
session hashes, tokens, challenge messages, or account data. Counts suffice.

Exact deletion policy
---------------------
One transaction samples a cutoff from PostgreSQL clock_timestamp(). It deletes:

    sessions:         expires_at <= cutoff
    challenges:       expires_at <= cutoff, consumed or unconsumed
    challenge_limits: window_start <= cutoff - interval '1 minute'

The last predicate matches the current challenge issuance window. If issuance
policy changes, update this policy together; do not delete active quota rows.
Consumed but unexpired challenges are intentionally retained. Sessions with a
live expiry are retained regardless of audience. No accounts, tasks, AI usage,
live challenges, live sessions, or active challenge-limit windows are removed
or modified. No cascaded account deletion or task/status update occurs.

The limit is shared across tables, NOT multiplied by three. Sessions are scanned
first, then challenges, then challenge windows, each ordered by expiry and primary
key. Each selection locks eligible rows with FOR UPDATE SKIP LOCKED and deletes
only those keys with an additional expiry predicate. Other cleanup workers can
run concurrently without double-counting rows. Locked rows are deferred rather
than blocking on active auth work. A concurrent issuer that refreshes a window
under lock is preserved. A short batch can reflect lock contention, not an empty
backlog. The fixed table order can defer later tables under sustained session
backlogs; schedule bounded repeated passes and monitor per-table backlog.

All three deletions commit atomically. A query/trigger error rolls back earlier
deletions in the same batch. Cancellation fails closed. A client-side commit
error can be ambiguous about persistence; a zero result plus error is not a
claim that no rows were removed. A subsequent scheduled pass remains safe.

The row limit bounds deletions and held row locks, not absolute wall time or
index entries examined under heavy contention. Context deadlines remain needed
for connection acquisition, SQL work, schema locks and transaction cleanup.
Existing base indexes cover session/challenge expiry; migration 0004 adds
challenge_limits_window_start_idx. Apply it as an owner migration before the
scheduled job. Non-owner execution needs schema USAGE and SELECT/DELETE plus
appropriate UPDATE privileges for row locking on the three auth tables; no
CREATE or ownership is required. Do not point local destructive tests at a
real workspace database.

Outcome and executed tests
--------------------------
Cleanup is implemented and exercised against real local PostgreSQL, with no
hosted DB or secrets access. Task accepted_unfunded status and the immutable
trigger were explicitly checked before/after cleanup. No scheduling, deployment,
commit, push, or parent-owned file edit was performed.

Database used:

    TEST_DATABASE_URL=postgresql:///pactra_ai?host=/var/run/postgresql&port=5546
    unset PACTRA_LIVE_TEST_DATABASE_URL

Tests call existing setup and then explicitly apply 0004_ai_usage.sql; no changes
to the shared setup or migration 0001 were needed. Test data lives only in that
local test database. The test setup drops/recreates pactra.

From /root/projects/pactra-landing/backend:

    /root/.local/toolchains/go1.27.1/go/bin/go test -count=1 -v ./internal/workspace -run 'Test(AIBudget|AuthCleanup)'

Actual result after implementation: PASS, ok pactra/backend/internal/workspace
2.216s. Tests were written first; the initial run failed compilation because
budget implementation symbols did not yet exist (the compiler stopped there).

Passing cleanup tests:

    TestAuthCleanupBoundedAndPreservesLiveState
    TestAuthCleanupValidationAndCancellation
    TestAuthCleanupAtomicRollback
    TestAuthCleanupSkipsLockedRows
    TestAuthCleanupConcurrentWorkers

These exercise total batch size, exact returned counts, repeated draining,
unchanged full accepted task row, retained accounts, working live tokens,
redeemable unconsumed challenge, retained consumed-but-live challenges/windows,
invalid limits/nil pool/cancelled context, trigger-induced rollback after earlier
deletes, locked-row skipping, refreshed-window preservation, and simultaneous
cleanup workers with real database row locks.

    /root/.local/toolchains/go1.27.1/go/bin/go test -race -count=1 ./internal/workspace

Actual result: ok pactra/backend/internal/workspace 6.873s.

    /root/.local/toolchains/go1.27.1/go/bin/go vet ./internal/workspace

Actual result: exit 0, no diagnostics.

    /root/.local/toolchains/go1.27.1/go/bin/go test -race -count=5 ./internal/workspace -run 'Test(AIBudget|AuthCleanup)'

Repeated stress result: ok pactra/backend/internal/workspace 9.299s. gofmt -l
on the owned Go files returned no paths; git diff --check returned exit 0.
Hosted smoke was not enabled. Parent integration and production scheduling
are not verified by these local tests.
