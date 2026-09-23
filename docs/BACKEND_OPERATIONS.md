# Minimal backend operations (development)

## Start safely
Bind HOST=127.0.0.1 unless an authenticated, reviewed proxy is configured. Keep DATABASE_URL on the Go process. No secrets in CLI arguments, shell history or public logs. Provisioned Pactra runtime role has no schema-creation privileges; migrations must be explicit, separate administrative operations.

Readiness: GET /ready includes a database ping in workspace mode. Liveness: GET /health remains independent. A healthy listener is not proof of funding, wallet-network correctness or AI quality.

## Manual backup and restore drill
Before real customer data, use pg_dump restricted to schema pactra through a secure admin/migration connection. Pass credentials via a mode0600 pgpass file or private process environment, never command-line URI. Encrypt the resulting backup and restrict access: manifests can contain private source text and session/challenge records are security-sensitive. Restore ONLY to an isolated test database, never blindly over hosted data. Verify constraints and participant access tests there. This document describes a required drill; it does not claim it has been performed.

## Cleanup
Expired sessions/challenges need a scheduled, bounded deletion job before sustained use. Deleting them must not touch manifests or financial audit history. A spent challenge cannot be reused; only expired/spent auth records are cleanup candidates. Record cleanup counts, never message contents/tokens.

## Key rotation
Rotate the Management API token previously shared in chat after provisioning. Separately rotate database runtime credentials and Azure key as appropriate, reload the API and verify readiness. Revoking a PAT does not revoke an existing database login; they are separate credentials.

## No financial authority
Do not add an administrative “mark paid” route. Settlement must follow verified contract receipts and chain-confirmation rules once contracts exist. Until then accepted_unfunded is the terminal implemented successful task state.
