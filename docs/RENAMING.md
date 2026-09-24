# Pactra rename cutover

The source tree now uses Pactra for UI and wallet metadata, `pactra-monorepo`
for the npm root, `pactra/backend` for Go imports, `PACTRA_*` for app environment
variables, and `pactra` for the private PostgreSQL schema. HTTP headers, cookies,
browser events, and sidebar storage use the same namespace. No old-name aliases
are kept. The frontend workspace path and npm selector remain `frontend`.

## Local repository

- The Git origin is `https://github.com/zDarkx1/Pactra.git`. No commit or push
  is part of this rename. Remote access still needs to succeed before pushing.
- The existing checkout folder may keep its current name. Its absolute path is
  not part of application configuration; new clones use `Pactra`.
- Rebuild rather than deploying cached bundles or previously built Go binaries.

## Existing deployments

This source change does not rename hosted resources, alter live data, or update
external secrets. Do not start the renamed backend against an unmigrated DB.

1. Stop the old frontend and backend. Back up the existing private app schema
   through an admin connection and verify the restore in an isolated database.
2. Rename app environment keys to match `backend/.env.example` and
   `frontend/.env.example`, retaining their values. Update CI/deployment secrets,
   service definitions, and private env files outside this repo too.
3. For an existing database, do **not** rerun `0001_workspace.sql` to create a
   second empty workspace. Confirm the source schema name and that `pactra` does
   not exist, then run this as its owner/admin. Replace the placeholder first:

   ```sql
   BEGIN;
   ALTER SCHEMA "<existing_app_schema>" RENAME TO pactra;
   COMMIT;
   ```

4. Keep the existing runtime role and credentials for the schema cutover. If a
   role rename is also needed, confirm no other app uses it, rename it separately
   to `pactra_runtime`, and rotate/update its credentials and `DATABASE_URL`.
   Review grants, default privileges, backups, and any externally stored SQL
   that explicitly names the source schema. Keep the schema out of the Data API.
5. Verify task/account counts and participant access before reopening traffic.
   Existing manifest JSON, hashes, and signed challenge text are historical
   data: do not rewrite embedded brand strings. Fresh SIWE messages use Pactra.
6. Deploy frontend and backend together. Users sign in again because cookie
   names changed. Sidebar preferences reset. Old browser cookies/storage are
   ignored, not migrated; server session expiry/revocation rules still apply.
7. Verify readiness, login, task reads, and logout with the new configuration.
   A fresh database instead uses `backend/migrations/0001_workspace.sql` once.

Hosted database cutover and real-wallet checks remain unverified by this pass.

## Local verification — 2026-09-23

- No previous product-name matches remain in source, config, fixtures, or docs.
  Git history, dependency/build caches, binaries, and the checkout path are excluded.
- Frontend: 72 tests, typecheck, and production build passed. Three docs/name
  consistency tests passed. The existing optional MetaMask async-storage build
  warning remains.
- Go workspace integration tests passed against a disposable local PostgreSQL 18
  cluster. A transactional schema rename round trip retained the tasks relation.
  The cluster was stopped afterward; no hosted database was contacted.
- The full Go suite failed twice at TestAIFailedAttemptsCooldown: Retry-After was
  11 instead of 10. That test and its cooldown implementation are unchanged.
  All other Go tests passed with this one test explicitly skipped; vet and the
  pactra-api binary build passed. The full suite is not reported as green.
- The new origin was saved, but git ls-remote returned Repository not found.
  Confirm the repository URL and access rights before pushing. No push occurred.

## Cooldown boundary fix — 2026-09-24

- TestAIFailedAttemptsCooldown failed deterministically on Windows because the
  Retry-After computation truncated the remaining seconds and added one; when the
  coarse Windows clock returns identical timestamps for both time.Now() calls the
  result was 11 instead of 10. backend/ai.go now takes the ceiling of the
  remaining cooldown seconds. No API semantics changed.
- Verified on Windows: the cooldown, concurrency and redirect/timeout tests pass
  with -count=20; the full Go suite passes with the race detector after enabling
  cgo with a local WinLibs GCC toolchain (winget, user scope). gofmt -l noise on
  this checkout is the CRLF autocrlf artifact, unchanged by this fix.
