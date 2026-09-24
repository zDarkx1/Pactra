# Pactra deployment and release boundaries

## Current verified baseline

The public UI is https://pactra.alrizky.me, hosted on the current Hermes VPS `74.249.35.159` with Nginx/TLS and non-root systemd services. The UI release before this development task is `8a4fc38`. It is an isolated stateless-checker preview, not a funded application. TerasKayuManis infrastructure is unrelated and unchanged.

The development branch is `feature/non-contract-workspace`. Source changes do not implicitly deploy, merge main, apply migrations, fund contracts, publish X posts or make the repository public.

## Workspace release checklist

1. Pass full frontend tests/typecheck/build and Go tests with a dedicated real PostgreSQL test database. Never point destructive test setup at hosted data.
2. Independently review auth, per-task ownership, immutable evidence, concurrency/idempotency, request limits and recovery. Exercise the actual browser→BFF→Go→database path.
3. Apply reviewed migrations0001–0004 in order using the migration role, after an encrypted backup. Read back exact schema and runtime grants. Runtime cannot create schema, and historical GRANT statements do not cover new tables automatically.
4. Set exact public auth domain/URI, chain/network configuration and runtime TLS verify-full CA. Secrets stay only in private server env, not browser/public docs.
5. Keep creation gated without real team arbiters. Keep AI disabled unless explicit provider and daily wallet/global caps are configured. Requests caps do not guarantee zero cost.
6. Install separate frontend/backend release artifacts and preserve previous service definitions/binaries. Verify public readiness and negative unauthorized/CSRF checks after switch. Do not rollback data migrations blindly.
7. Verify private pages no-store/noindex, read failures/retries, actual wallet devices, cleanup and hosted recovery. Report incomplete gates honestly.

## Upstream transport

Production BFF accepts HTTPS Go URLs, or HTTP on exact numeric `127.0.0.1` / `::1` for a same-machine backend behind the public TLS terminator. Non-loopback HTTP and ambiguous/credentialed origins are rejected. Go binds loopback; never expose its port publicly.

## Operations and competition

[Operations verification](OPERATIONS_VERIFICATION.md) describes what was actually restored locally and the limits of the tooling. Production grants/key custody and disaster recovery must be independently verified.

The guidebook describes GitHub Pages, but this Next application depends on server routes. Confirm alternate hosting/subdomain acceptance with organizers; an unchanged static export is not supported. See [submission readiness](../SUBMISSION_READINESS.md).
