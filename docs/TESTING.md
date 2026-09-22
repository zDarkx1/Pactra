# Testing strategy

## Local gates
At root: npm test; npm run test:docs; npm run typecheck; npm run build.
At backend: go test -race ./...; go vet ./...; go build -o bin/proofpay-api ./cmd/server.

## Browser acceptance
Start both services. Initial missing-placeholder example must fail. Correcting it must pass objective checks while semantic AI remains not_configured. Invalid input must not generate fake results. Editing after a successful report invalidates it. Test narrow mobile and desktop, keyboard navigation, slow/out-of-order responses and backend outage.

## Transport tests
Oversized payload; wrong media type; duplicate keys; unknown fields; null objects/rules; trailing JSON; extra/missing keys; repeated placeholders; exact required terms; whitespace; unsupported nested values. Stable result ordering and concurrent race-free calls.

## Future financial gates
See contracts/README.md. Test real distinct wallets, approval rejection, reverted transaction, duplicate retry and reconciliation. Mock fixtures must never be presented as real chain results. A green checker cannot prove translation quality, user consent or escrow correctness.

## Evidence
Record exact command, environment, outcome and remaining gaps in VERIFICATION.md. CI is a gate, not a substitute for public end-to-end testing.
