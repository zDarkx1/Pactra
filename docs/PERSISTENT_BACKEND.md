# Persistent backend handoff

This increment adds wallet-authenticated, persistent invitations and immutable agreement acceptance. It does **not** add money movement, funded-work submissions, storage uploads, or deployment. Frontend workbench is unchanged; the new endpoints are for the frontend team to integrate.

## Safe development choices
- EOA wallet login: server-generated SIWE message, configured domain/URI/chain, five-minute one-use nonce, EIP-191 verification, random bearer session lasting24hours. Only token hashes persist.
- No smart-contract wallets/EIP-1271 yet. A successful login proves control of the signing key, not a person's identity.
- Invitations expire at the earlier of72hours or the delivery deadline. Cancellation is buyer-only before acceptance. Accepted agreements cannot be edited or reassigned in place.
- Buyer, worker, primary arbiter and backup arbiter must all be distinct, valid nonzero wallet addresses. Arbiters come from a server-side team allowlist, never arbitrary buyer input alone.
- No real arbiter wallets have been provided. Empty allowlist deliberately disables task creation. Automated tests use ephemeral test wallets only; they are not production arbiters.
- Allocation amounts are base-unit decimal strings, never JSON floats. Total must fit uint256. The backend does not yet claim what on-chain asset/token decimals these terms settle in.
- Each deliverable has revision limit0..5 and review window24..168hours. Delivery deadline1hour..90days. These are technical MVP bounds, not a claim that a specific agreement was accepted.
- SHA-256 manifest fingerprint protects application-version agreement. It is **not** a finalized Solidity commitment format or a payment authorization.
- Accepted state is explicitly `accepted_unfunded`. There is no API to mark funded, paid or settled manually.

## Local PostgreSQL workflow
Use an isolated development database. Never set TEST_DATABASE_URL to the hosted Pactra database: integration tests may destroy/recreate the pactra schema.

1. Apply `backend/migrations/0001_workspace.sql` using an administrative migration connection.
2. Create a runtime database role with no SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS. Grant USAGE on schema pactra and required table DML, never schema CREATE or ownership.
3. Configure DATABASE_URL, PACTRA_AUTH_DOMAIN, PACTRA_AUTH_URI and PACTRA_CHAIN_ID together. Partial configuration fails startup. Remote DATABASE_URL must use sslmode=verify-full.
4. Set PACTRA_ARBITERS to comma-separated team-approved wallet addresses to enable task creation. Empty is safe.
5. Run `go run ./cmd/server` from backend after exporting configuration. Go does not auto-load dotenv files.

For localhost development use domain localhost:3000, URI http://localhost:3000 and a deliberately selected local chain ID (e.g.31337). These are local development settings, not a verified BOT Chain production configuration.

## Isolation and trust
The `pactra` PostgreSQL schema is private and not exposed through Supabase's public Data API. Next should call Go with a verified session; no admin/service-role/PAT credentials in the frontend. Go enforces participants on every task read/write. Runtime DML permission does not eliminate application-level authorization requirements. A compromised runtime credential can access that schema: protect it and do not distribute it broadly.

Supabase session pooler port5432 is used for IPv4 development connectivity. TLS client verification uses the Supabase CA plus hostname checking. An internal pooler-to-Postgres pg_stat_ssl row can report false even while the application-to-pooler connection is verified TLS; inspect client TLS separately.

## Before public launch
Global in-process challenge limiting is a starter abuse control, not distributed protection. Add edge IP throttling and monitoring, spent-nonce/session cleanup, per-user AI quotas/authentication, secure frontend session storage/BFF design, and security review. Existing stateless AI endpoint remains local-development-only. Do not expose it simply because wallet routes now exist.

Production SIWE domain/URI/chain must match the real deployed frontend and intended network. Funding stays blocked until reviewed contracts and all exit paths are defined. No automatic mainnet behavior is introduced here.
