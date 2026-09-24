# Voluntary unfunded review API

Frontend integration schema (published before implementation; verification outcome follows below).

All routes require the existing Bearer session. Only the task buyer and worker can read; arbiters and outsiders receive 404. These routes work ONLY while task.status is `accepted_unfunded`, and never change that status. This is voluntary unfunded work review, not a delivery obligation, payment, funding, timer, or arbiter adjudication. There is no automatic acceptance or dispute resolution.

Base: `/api/v1/tasks/{id}/deliverables/{deliverable}` (manifest deliverable ID).

GET `/submissions` -> 200 snapshot (including all immutable histories).
POST `/submissions` -> 201 snapshot; worker only.
POST `/reviews` -> 201 snapshot; buyer only.
POST `/disputes` -> 201 snapshot; either participant, after a submission exists.

Every POST requires:

    {
      "idempotency_key": "lowercase UUID v4",
      "unfunded_review": true,
      "manifest_hash": "64 lowercase hex characters from task",
      "expected_version": 0,
      "artifact_hash": "",
      "notes": "optional; at most 2000 Unicode characters"
    }

Submission adds `artifact`: a raw flat JSON object of string values, at most 16 KiB in its supplied JSON representation and at most 100 keys. Empty object is allowed (checker may reject it). Keys are nonblank, at most 160 Unicode characters; NUL is forbidden in keys, values and notes. Duplicate keys (including escaped equivalents), invalid UTF-8, unpaired Unicode surrogates, nulls, nesting and unknown fields are rejected. Entire request is at most 64 KiB. Content-Type must be application/json.

Initial submission: expected_version=0 and artifact_hash="". Revision submission: expected_version and artifact_hash identify the latest existing submission, and review state must be revision_requested. Only the worker can revise; total revisions cannot exceed the immutable manifest revision_limit.

Review adds `decision`: exactly `accept` or `request_revision`. expected_version and artifact_hash must identify the latest submission. Only submitted state can be reviewed. A revision request is rejected when no revisions remain. Accepted is terminal, including against disputes.

Dispute has no additional fields. expected_version and artifact_hash identify the latest submission. It freezes submitted/revision_requested state permanently as disputed; records only the participant's notes and an evidence flag, not a finding, funds or resolution.

Snapshot schema:

    {
      "task_id": "UUID",
      "deliverable_id": "manifest slug",
      "task_status": "accepted_unfunded",
      "unfunded_review": true,
      "manifest_hash": "64 lowercase hex",
      "state": "not_submitted|submitted|revision_requested|accepted|disputed",
      "latest_version": 0,
      "latest_artifact_hash": "",
      "revision_limit": 0,
      "submissions": [],
      "reviews": [],
      "disputes": []
    }

Submission history entry:

    {
      "version": 1,
      "actor": "worker address",
      "artifact": {"key": "value"},
      "artifact_hash": "SHA-256 of application canonical artifact JSON",
      "manifest_hash": "accepted manifest hash",
      "notes": "",
      "created_at": "RFC3339 timestamp",
      "checker": {
        "policy": "default_metadata_only",
        "rules": {"preserve_placeholders": false, "required_terms": []},
        "http_status": 200,
        "output": {"checker_version": "localization-v1", "passed": true, "checks": [], "ai_review": {"status": "not_configured", "message": "..."}}
      }
    }

Checker output is the ACTUAL response from the existing pactra/backend checker, run locally with AI disabled against the immutable manifest source and submitted artifact. Key parity/nonblank checks are default metadata, NOT invented agreed acceptance criteria; checker failure does not prevent human review. No placeholder/term requirements are inferred from prose. Checker input limits differ from workspace limits: if the real checker rejects input, http_status and output preserve its actual error response instead of inventing evidence. Example output above describes fields, not a promised result.

Review entry: version, artifact_hash, manifest_hash, actor, decision, notes, created_at.
Dispute entry: version, artifact_hash, manifest_hash, actor, notes, created_at, evidence_flag=true. The flag marks a participant dispute record, not verification of the allegation.

Application canonical JSON recursively sorts keys using Go encoding/json compact representation (not RFC 8785/JCS). Artifact hash ignores whitespace, key order and equivalent JSON string escapes. Immutable history records preserve the canonical artifact, not its original formatting.

Idempotency scope is (task, deliverable, route operation, actor, idempotency_key). Same key and canonical payload returns the original 201 snapshot even after later transitions. Different canonical payload gives 409. Omitted notes and empty notes are equivalent. Invalid requests do not consume keys. Row locks serialize state/version updates and idempotency recording atomically. Distinct concurrent mutations of the same version cannot both transition it.

Errors use existing `{ "error": "HTTP status text" }`: 400 invalid input/acknowledgment/hash/key, 401 missing/invalid session, 403 wrong participant role, 404 inaccessible task or missing deliverable, 409 ineligible task/state, stale version/hash, exhausted revisions or idempotency mismatch, 413 oversized request, 415 wrong media type, 503 storage/checker internal failure. Responses are no-store.

## Implementation and actual test outcome

Implemented and verified locally. Only delivery-owned Go files, migration 0003 and this document were edited by this agent. No commits, pushes, deploys, hosted database access, secrets access or delegation. Existing task/auth test fixtures create local test identities; no real arbiters, funds or evidence are asserted.

Implementation files:
- `backend/internal/workspace/delivery.go`
- `backend/internal/workspace/delivery_test.go`
- `backend/internal/workspace/delivery_boundaries_test.go`
- `backend/migrations/0003_delivery_review.sql`

Storage uses append-only `pactra.delivery_events` and `pactra.delivery_idempotency`. UPDATE, DELETE and TRUNCATE are rejected by migration triggers. State is derived from immutable history, so there is no separately mutable review-state row to drift. The existing parent task row is locked FOR UPDATE for reads and mutations, including the initial submission, across separate handler instances/processes. The event and original idempotent response commit together. No task UPDATE is issued. Histories are naturally bounded by revision_limit (maximum five revisions); no pagination is needed.

Real test environment: Go `/root/.local/toolchains/go1.27.1/go/bin/go`, PostgreSQL `TEST_DATABASE_URL=postgresql:///pactra_delivery?host=/var/run/postgresql&port=5546`. Tests use the existing setup (0001 only), then apply this migration themselves, and use their own authenticated `registerDelivery` route harness. They use real PostgreSQL transactions and the real checker, not mocked SQL/checker results. Each setup drops only the local test database's pactra schema; do not point these tests at shared or production databases.

TDD evidence: tests were written first. The initial isolated test compilation failed with `s.registerDelivery undefined`, before delivery implementation existed. An initial package-wide compile also encountered another agent's unfinished AI-budget test symbols; after their implementation appeared, package-wide delivery selection compiled and passed.

Commands run from `backend` (TEST_DATABASE_URL exported separately):

    /root/.local/toolchains/go1.27.1/go/bin/go test ./internal/workspace -run '^TestDelivery' -count=1
    ok pactra/backend/internal/workspace 1.463s

    /root/.local/toolchains/go1.27.1/go/bin/go test -race ./internal/workspace -run '^TestDelivery' -count=3 -v
    PASS
    ok pactra/backend/internal/workspace 6.682s

    /root/.local/toolchains/go1.27.1/go/bin/go test -race ./internal/workspace -run '^(TestDelivery.*|TestAuthFlow|TestTasksFlowPrivacyAndRaces|TestInputAndRateLimits|TestConfig)$' -count=1
    ok pactra/backend/internal/workspace 3.349s

    /root/.local/toolchains/go1.27.1/go/bin/go vet ./internal/workspace
    exit 0, no diagnostics

    git diff --check
    exit 0, no whitespace errors

Verified cases: initial submission and all five allowed revisions; zero/exhausted revision limits; accepted terminal; dispute freeze by either participant from submitted/revision-requested state; immutable task status; buyer/worker privacy and roles; arbiter/outsider denial; invited/cancelled rejection; missing deliverable; exact 16-KiB artifact and 100-key boundaries; 2000-character Unicode notes; oversize/padded artifact and request rejection; duplicates/escaped duplicates, null/nested/non-string values, unknown/missing fields, invalid Unicode and NUL rejection; canonical hash and equivalent escaped/reordered idempotent replay; stale manifest/artifact/version rejection; actor/operation-scoped keys; mismatch 409; identical concurrent replay; conflicting concurrent acceptance/dispute; separate-handler concurrent revisions; real SQL failure after event insertion rolling the entire mutation back and allowing retry; immutable history UPDATE/DELETE/TRUNCATE rejection. Actual checker pass/fail/input-error output is preserved, and failure/error responses are compared against a separate invocation of the existing checker.

Integration remaining with parent: wire `s.registerDelivery(mux)` (or `s.registerDelivery(m)` for the current local mux name) in `workspace.New`, and include migration 0003 in the parent's migration workflow. At the last inspection, workspace.go did not yet call registerDelivery; this agent intentionally did not edit it. Therefore handler behavior is verified through the owned route harness, not claimed deployed or exposed by New yet. No full hosted-smoke suite was run.
