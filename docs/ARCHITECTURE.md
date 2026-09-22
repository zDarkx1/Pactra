# Architecture and boundaries

## Current request path
Browser → Next.js `POST /api/check` → Go `POST /api/v1/check` → deterministic response.
The browser never needs a Go host URL or a secret. Next is a thin transport/UI boundary; Go owns checker rules. There is no database. Restarting services loses no persisted tasks because tasks do not yet exist.

## Ownership
- Frontend owner: frontend/app, components, request state, accessible feedback, same-origin proxy and response validation.
- Backend owner: backend/cmd, internal checker/HTTP, limits, deterministic semantics and error contracts.
- Contract owner: contracts design and future Solidity implementation; may not make AI a payout authority.
- Shared changes: docs/API.md, checker semantics/version, fixtures and future ABI. Coordinate before parallel edits.

## Future architecture (proposal)
Go authenticates wallet sessions, manages private snapshots and review jobs; PostgreSQL stores off-chain lifecycle data; object storage preserves content versions. Contracts remain authoritative for funds, accepted allocations and withdrawals. An indexer reconciles confirmed events, handles reorgs and marks pending separately from final state. No direct browser database writes.

Avoid microservices initially. Never copy credentials, schema or live data from TerasKayuManis. These are unrelated projects.

## Failure boundaries
HTTP success is not chain confirmation. Lost responses require readback with stable operation identity, not a new deposit. AI failure leaves deterministic/manual review available. A hash without a retrievable snapshot is not enough for future inspection. Client-side state is not acceptance authority.

## Change discipline
Freeze API/checker versions before handing fixtures to teammates. Existing clients need an explicit compatibility plan for breaking changes. Contract addresses and ABI must be versioned together; no invented addresses in examples.
