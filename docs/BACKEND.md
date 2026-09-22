# Backend development guide

## Responsibility
Go is the authoritative implementation of deterministic checker semantics. The starter is stateless and does not custody funds, persist documents or call AI.

## Structure
cmd/server is the executable entry point. backend/handler.go currently contains the public NewHandler, strict parser and pure checking logic in package backend; tests are adjacent. Split internal packages when complexity warrants it; do not assume they already exist. Prefer standard-library HTTP and small pure checker functions over a framework for this slice.

## HTTP discipline
Bound request size before decoding. Reject malformed/trailing JSON, duplicate keys, unknown top-level/rule fields, null required objects and wrong value types. Return stable machine-readable error codes and generic messages. Do not log submitted content. CORS is intentionally absent because browser traffic goes through Next.

## Determinism
Sort keys, keep check ordering stable and version algorithm changes. Placeholder checks compare occurrence counts, not just set membership. Required terms are exact case-sensitive substrings per corresponding source key, not a semantic translation rule.

## Local commands
```bash
go run ./cmd/server
go test -race ./...
go vet ./...
go build -o bin/proofpay-api ./cmd/server
```
Run from backend/. Server must exit nonzero on invalid configuration or occupied port and handle graceful termination. Readiness means this stateless checker can serve; it does not mean a DB, AI model or blockchain is connected.

## Next slices
- Introduce persistence only with reviewed schema/migrations and restricted credentials.
- Wallet authentication: one-time nonce, domain/chain binding, expiry, signature checks and secure session policy.
- Immutable artifact snapshots and scoped authorization; never hash only a mutable URL.
- AI interface and real provider adapter with timeout, redaction, schema/evidence validation and explicit unavailable states.
- Confirmed chain-event ingestion, deduplication and recovery; Go cannot override contract balances.

## Security and money
Do not create approve/settle endpoints until authorization, idempotency and on-chain confirmation semantics are designed. An advisory check response must never be converted directly into a server-signed payout.
