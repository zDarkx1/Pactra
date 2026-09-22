# Verification evidence

## Executed on build host
- Node24, Next16.3.5, React19.3.0, Go1.27.1.
- Frontend unit tests: six passed, including raw duplicate-key preservation, input validation, result invalidation and BFF origin handling.
- Next production build and TypeScript check passed.
- Go race tests and vet passed; health/readiness and real checker HTTP calls returned the documented shape.
- Real Chromium at390px and1440px against Next + Go: initial placeholder failure, corrected pass, stale report cleared after edits and duplicate-key rejection all passed. No browser runtime errors or horizontal overflow in those scenarios.
- npm audit --omit=dev reported zero vulnerabilities at the time of the check; this is not a complete security audit.

## Fixes during verification
The frontend helper stopped before writing CSS; parent completed it and rebuilt. Next reconstructed an internal hostname for request.url, causing legitimate browser calls to be rejected. The stateless, credential-free BFF now checks Fetch Metadata cross-site requests and JSON content type; browser and route regression tests passed. Startup path standardized to backend/cmd/server.

## Limits
Independent reviewer attempt timed out without a verdict. Do not describe this starter as independently approved or production-ready. CI status must be checked on GitHub after push; local checks are not remote CI evidence.
No AI/provider, wallet authentication, persistent task storage, escrow, testnet/mainnet deployment, real funds or public hosting were tested because they are not implemented.
Optional AGENTS.md was not created because its separate approval expired; human team docs are available in README and docs/.
