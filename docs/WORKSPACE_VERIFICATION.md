# Persistent backend verification

## Actual execution
- Local isolated PostgreSQL16 integration: 47 top-level Go tests passed with race detector; hosted smoke deliberately skipped in this local suite and run separately.
- Covers SIWE wallet auth, wrong/high-S/expired/replayed signatures, concurrent nonce consumption, audience-bound sessions/logout, exact JSON field names/Unicode handling, challenge budgets, participant privacy, manifest validation/immutability, acceptance/cancellation races, restricted runtime DML and server configuration.
- Go vet and API binary build passed.
- Frontend existing6tests and docs2tests passed; typecheck and Next production build passed. Frontend has not been extended with wallet/task UI.
- govulncheck found reachable issues in initial pgx/x-text dependencies. Updated pgx to5.9.2 and x/text to0.39.0; rerun had no reachable vulnerabilities. This is not a security audit or a guarantee against undiscovered issues.

## Hosted proof (not a mock)
Historical run against project ncnuvnbqcaqwawujltiu using its provisioned runtime role via verified TLS. This predates the repository rename and does not verify the new schema or role names; see [rename cutover](RENAMING.md).
- Applied0001_workspace.sql and read back tables and migration checksum.
- Runtime confirmed no schema CREATE or migration-metadata access.
- Ephemeral test-wallet challenge→signature verification→session→task creation→worker acceptance→logout succeeded.
- No chain transaction or AI call was made in this smoke. All test fixture rows removed; task count read back as zero.
- Actual server readiness returned persistent-workspace and DB ping passed; unauthenticated tasks request returned401.
- Default hosted-backed development config has no arbiter allowlist and cannot create real tasks. Only isolated test handler used generated fixture arbiters.

## Review
Independent reviewer identified TLS-host override, cross-audience sessions, case-alias JSON fields and global quota exhaustion issues. Regression tests reproduced the issues before fixes. Domain-binding and pre-dispute arbiter privacy regression tests were also added. Independent final review passed for this bounded local/unfunded workspace with no unresolved security or logic blockers. Reviewer independently reran the local PostgreSQL workspace race suite, server configuration tests and vet. This is not approval for production or funds. Nonblocking suggestions: expand arbiter privacy route coverage and extract effective DB TLS validation for more direct unit tests.

## Not claimed
No public deployment, wallet frontend testing, funded-work submission, chain funding/settlement, EIP-1271 wallet support, production chain/domain verification, restore drill or broad load/pentest. Existing AI route still needs authentication and durable per-user spend controls before public exposure. No commercial guarantee or automatic mainnet authorization.
