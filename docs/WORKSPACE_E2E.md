# Real local workspace E2E

This harness owns only `scripts/workspace-e2e.mjs` and this document. It does not modify application/backend source, install dependencies, migrate/reset a database, deploy, or change Git state.

## Safety and prerequisites

Run only against the parent's isolated local stack:

- Next.js: `http://localhost:3999`
- Go: `http://127.0.0.1:8499`
- PostgreSQL: database `pactra_e2e`, Unix socket `/var/run/postgresql`, port `5546`
- Apply migrations 0001–0004 and wire workspace/delivery routes before running. The parent owns stack preparation and startup. Do not build into a concurrent dev server's `.next` directory.
- The app and Go SIWE audience must use domain `localhost:3999`, URI `http://localhost:3999`, and the same chain ID. Configure both with the fixture primary/backup arbiter allowlist, never a public release's identities. The harness discovers the configured chain using a genuine BFF challenge.
- External Playwright: `/root/ui-research/node_modules/playwright/index.mjs`
- Chromium: `/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`
- Node and the app's existing `viem/accounts` and `viem/siwe` packages; `psql` with passwordless access to the isolated local database for SELECT-only readback.

The readiness flag `/root/ui-research/pactra-e2e-ready` is a parent handoff; the script independently probes the fixed local servers and database. It fails promptly if prerequisites are unavailable rather than waiting indefinitely. Browser actions, HTTP calls, database queries and navigation have bounded timeouts.

The script refuses configurable remote targets. Browser HTTP requests outside the two allowed local origins are blocked, not mocked. This includes attempted public RPC reads by the current wallet UI. Those blocked requests and their browser resource messages are explicitly recorded as expected diagnostics; no RPC response is fabricated. No chain transactions, funds, real-user wallet, extension profile, AI provider calls, hosted database, or existing secret configuration are used. The deterministic delivery checker is real and records AI as `not_configured`.

## Prepare fixture identities

From `/root/projects/pactra-landing`:

    node scripts/workspace-e2e.mjs --prepare-fixtures

This explicit preparation command prints only fixture addresses and an address-only `PACTRA_ARBITERS` assignment for local configuration. Never configure these TEST identities on a public release.

Private fixture file:

    /root/ui-research/pactra-e2e-fixtures.json

It contains buyer, worker, primary, backup and outsider identities. Cryptographic secp256k1 keys are generated with viem only when the file does not exist. Exclusive creation, no-follow opens, owner checks and exact mode 0600 protect the file; an existing insecure/invalid file fails rather than being replaced. Repeated preparation validates and reuses the same identities. Do not copy fixture contents into reports or source control. Normal runs do not print addresses, private keys, signatures, cookies or session tokens.

## Run

    node --check scripts/workspace-e2e.mjs
    node scripts/workspace-e2e.mjs

Exit 0 means all checks passed. Exit 1 produces a safe failure code and an artifact directory. Authentication has real backend rate limits: rapid repeated runs may receive 429. Allow the actual fixed window to expire before retrying; the harness does not bypass or reset it.

Each run has a timestamp plus random UUID suffix in its task title and output directory. Existing records are not overwritten or deleted. A second pagination task is genuinely created and cancelled; the reviewed task is retained for inspection. A failed run may leave partial TEST agreements in the isolated database. Do not run concurrently with another instance using the same fixture buyer because the pagination check intentionally expects the run's two newest tasks.

Optional, explicitly limited fallback:

    node scripts/workspace-e2e.mjs --api-auth

This uses genuine SIWE challenge/signature verification through same-origin browser fetch, receives the real HttpOnly BFF cookie, and then connects the injected wallet through the UI. It does not test the Sign in button. The report identifies this mode; there is no silent fallback. The default run uses the actual Connect wallet picker followed by Sign in.

## What is verified

UI evidence:

- Real isolated Chromium contexts for buyer, worker and outsider; actual button text is inspected and saved before choosing the wallet.
- Clearly labeled injected EIP-1193 LOCAL TEST wallet. Private keys stay in Node memory; `page.exposeFunction` signs only matching, unexpired local Pactra SIWE messages. The provider exposes account/chain methods, real `personal_sign`, and account/chain events. It is NOT real extension QA.
- Default mode connects and signs in using the UI; server-authenticated account and HttpOnly/Strict cookie flags are verified without saving cookie values.
- Worker accepts the exact immutable agreement in its UI confirmation.
- Worker submits voluntary version 1; the actual checker fails a deliberately blank value. Buyer requests revision. Worker submits version 2; actual metadata checks pass. Buyer accepts it.
- A second deliverable is submitted and a participant flags a dispute. This is an allegation/evidence flag, not adjudication.
- Real account and chain change events clear private UI data and revoke old-session access. Wrong-network UI is `Switch network`.
- Outsider UI shows denial and never exposes the private title.
- Buyer/worker final desktop and 390×844 mobile screenshots, including opened actual checker evidence. Document and body widths cannot exceed the mobile viewport. Application alert regions must be empty on successful participant pages; Next.js's route announcement live region is not an application error.

API evidence, deliberately distinguished from form UI coverage:

- Agreement creation uses genuine same-origin `/api/workspace` browser fetch after authentication, with buyer/worker/arbiter fixture addresses. The cumbersome creation form is NOT tested.
- The initial create response body is deliberately discarded and the exact payload/key retried. This exercises response-discard recovery, NOT a real network outage or the UI uncertain-intent retry control. Changed payload with the same key is rejected.
- After later acceptance, create replay returns the original invited snapshot while fresh GET remains `accepted_unfunded`.
- The exact first submission intent is observed from its real UI request and replayed after buyer acceptance. It returns the historical snapshot without appending an event or regressing current state. Changed payload under that key is rejected.
- Two cursor pages via real browser cookies, plus outsider reuse of the cursor without gaining access. Pagination UI is NOT tested.
- Delivery fresh reads verify every UI transition, recorded checker output, versions, review history and dispute evidence flag.
- Accepted/disputed terminal boundaries, outsider read/write denial, mismatched account/chain headers and logout revocation.
- SELECT-only queries against `pactra_e2e:5546` confirm the exact BFF-created UUID exists and ends with unchanged manifest hash and `accepted_unfunded` status. No synthetic SQL inserts are used.

All successful paths go through the actual BFF, real Go HTTP handlers, real database and real checker. No API route is fulfilled with canned data. Negative HTTP statuses are expected assertions, not ignored test failures. Unexpected console errors and uncaught page errors fail the run. Reports never contain arbitrary raw console/error messages, stack traces, auth response JSON, request headers, HAR, trace archives, or browser storage snapshots.

## Artifacts and actual outcome

Output root:

    /root/.hermes/output/pactra-workspace/

Every run saves:

- `report.json`: pass/fail, safe phase/error code, UI/API provenance, asserted HTTP statuses, expected diagnostics and screenshot filenames.
- `checker-and-history.json`: actual authenticated accepted/disputed delivery snapshots and actual checker outputs, not illustrative responses.
- PNG screenshots: authenticated UI, version history, desktop/mobile final state, outsider denial, account/network invalidation; failure screenshots when possible.
- `*-controls.json`: actual UI button texts inspected for wallet connection; safe button diagnostics on failure.

The run directory is private (0700); JSON reports and private fixtures are 0600. Task IDs, manifest/artifact hashes and TEST wallet addresses can appear in screenshots/history; private keys and session tokens cannot.

Verified default UI-sign-in execution, exit 0:

    /root/.hermes/output/pactra-workspace/2026-09-24T02-37-44-014Z-197aca3d/

The optional `--api-auth` fallback was also exercised to completion, exit 0, in `/root/.hermes/output/pactra-workspace/2026-09-24T02-38-52-379Z-6df120cc/`. Its top-level authMode correctly says UI sign-in was not tested; that earlier report's create-check provenance still says “after UI authentication” (a labeling bug corrected in the harness afterward). The default UI result above does not have that limitation. Fixture preparation was run twice with output suppressed and exited 0 both times; syntax and owned-path whitespace checks passed.

Real execution passed UI sign-in for buyer/worker/outsider, agreement acceptance, both voluntary versions, revision, buyer acceptance, dispute, historical idempotency replay, API pagination/privacy, mobile overflow checks, account/network invalidation, logout and exact local DB readback. Unexpected browser errors: zero. Expected blocked public-RPC attempts and navigation/identity cancellations are separately recorded; this is not a claim of zero browser console messages. The final agreement remains `accepted_unfunded`; no deposit, payout, arbitration outcome, onchain activity or real extension compatibility is claimed.
