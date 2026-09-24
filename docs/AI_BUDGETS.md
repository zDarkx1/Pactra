AI request budgets
==================

Owned implementation
--------------------
backend/internal/workspace/ai_budget.go
backend/internal/workspace/ai_budget_test.go
backend/migrations/0004_ai_usage.sql

Integration contract for the parent owner
-----------------------------------------
The method available inside package workspace is:

    func (s *server) budgetedAI(inner http.Handler, limits AIBudgetLimits) http.HandlerFunc

    type AIBudgetLimits struct {
        WalletDaily int
        GlobalDaily int
    }

Parent adds its chosen Config fields for the real review handler and limits,
then mounts exactly POST /api/v1/review using s.budgetedAI(handler, limits).
Use the real backend.NewHandlerWithAI result; there is no provider implementation
or success-response fabrication in this wrapper. Do not leave an unprotected
parallel route to the configured review handler. Parent owns request timeout:
35 seconds for review, without nesting inside the existing 5-second workspace
context. Other workspace routes should retain their existing shorter timeout.

workspace.go, cmd, and frontend are outside this ownership. They were not edited
here. Wiring/config/timeout integration is a parent responsibility, not a claim
that this wrapper is already exposed by New. No scheduler or deployment changes
were made. All limits default to zero (disabled). Explicit example: WalletDaily
5 and GlobalDaily 20; these values are NOT silently installed as defaults.

Behavior
--------
Every request passes through existing s.auth: audience-bound, unexpired bearer
session lookup. Unauthenticated requests return 401 without a reservation.
After authentication, missing inner handler or either missing, nonpositive, or
out-of-range limit returns 503 without dispatch/reservation. The low hard safety
ceilings are MaxAIWalletDaily=100 and MaxAIGlobalDaily=1000. Exceeding either
ceiling disables dispatch rather than silently clamping or allowing unlimited
requests. Configure all replicas consistently; differing limits do not create
a shared, persisted policy (the counters, not the configuration, are durable).

Each admitted request spends one wallet reservation AND one deployment-global
reservation. Wallet identity comes only from the authenticated account, not a
caller-supplied address. All sessions/audiences using the same wallet/database
share wallet usage. Global usage is shared by all wallets/instances using that
database. These are daily request counts, NOT currency, token budgets, billing
estimates, or a guarantee about provider charges.

Reservation is one READ COMMITTED PostgreSQL transaction. One database-clock
UTC date is sampled and reused for both counters, independent of session timezone
and application-host clock. Conditional UPSERT row locks use global-then-wallet
ordering, including first insertion races. Wallet rejection rolls back the
global increment; global rejection never increments the wallet. Quota exhaustion
returns 429. Database failure returns generic 503 and never dispatches. Dispatch
occurs only after a successful commit and with the original request/context.
Provider responses pass through unchanged. Parent must ensure one provider
attempt per admitted request if that is the desired provider-call ceiling.

The reservation day is the UTC date sampled during admission. Old day rows are
retained, so a new day uses fresh keys without resetting historical counters.
There is no in-memory counter to reset on restart. Midnight is not a rolling
24-hour window. No background pruning is included.

All dispatched outcomes count, including provider 502/429/504, malformed input,
provider-not-configured responses, and crashes/cancellations after commit. There
are deliberately no refunds or automatic retries. A commit with an ambiguous
client-visible outcome can spend capacity without calling the provider. An
already-cancelled context after commit prevents dispatch but keeps its count.
This favors conservative under-use over uncounted attempts.

Schema and operational scope
----------------------------
Apply migration 0004 after the base workspace schema with the owner migration
role before enabling review. It creates pactra.ai_usage_global (UTC day/count)
and pactra.ai_usage_wallet (UTC day/address/count), with positive bounded counts,
primary keys, wallet account FK, and explicit PUBLIC revocation. It also adds
the challenge-window expiry index used by auth cleanup. It stores no input,
review evidence, bearer token, provider response, or currency amount.

A non-owner runtime needs USAGE on pactra and SELECT, INSERT, UPDATE on these
two new tables. Earlier GRANT ON ALL TABLES commands do not retroactively grant
new tables unless corresponding role default privileges were arranged. Migration
is one-shot, not an idempotent startup action. Do not delete current usage to
'retry' a failed request; doing so removes the durable cap. Backups must include
usage tables; restoring older counters can reopen capacity already spent.

No account/task creation, task status mutation, funds, arbiter assignment,
acceptance, settlement, or manufactured review evidence is performed here.
accepted_unfunded and the immutable task trigger are unchanged.

Executed verification
---------------------
Tests use only this isolated local database (the setup drops the pactra schema):

    TEST_DATABASE_URL=postgresql:///pactra_ai?host=/var/run/postgresql&port=5546
    unset PACTRA_LIVE_TEST_DATABASE_URL

From /root/projects/pactra-landing/backend, with the provided Go toolchain:

    /root/.local/toolchains/go1.27.1/go/bin/go test -count=1 ./internal/workspace -run 'Test(AIBudget|AuthCleanup)'

TDD red: run before implementation failed to build with undefined AIBudgetLimits
and s.budgetedAI. After implementation, the verbose run passed all selected
tests: ok pactra/backend/internal/workspace 2.216s.

    /root/.local/toolchains/go1.27.1/go/bin/go test -race -count=1 ./internal/workspace

Actual result: ok pactra/backend/internal/workspace 6.873s.

    /root/.local/toolchains/go1.27.1/go/bin/go vet ./internal/workspace

Actual result: exit 0, no diagnostics.

    /root/.local/toolchains/go1.27.1/go/bin/go test -race -count=5 ./internal/workspace -run 'Test(AIBudget|AuthCleanup)'

Repeated stress result: ok pactra/backend/internal/workspace 9.299s. gofmt -l
on the four owned Go files returned no paths; git diff --check returned exit 0.

AI coverage: default/invalid limits, no inner handler, unauthenticated/expired/
wrong-audience tokens, failures counted, independently visible committed counts
before dispatch, wallet rejection rollback, global rejection, server recreation,
concurrent admission through two independent pools, non-UTC database timezone,
previous-day history, injected transactional storage failure, cancellation while
waiting on a real row lock, schema constraints, and the real backend.NewHandler
with empty provider configuration returning ai_not_configured. Test-only inner
handlers exercise admission and failure behavior; they are not review evidence.
No live provider request, hosted DB access, secrets access, commit, push, or
deployment was performed. Broader route/config integration remains parent-owned.
