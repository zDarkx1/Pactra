# Integrated non-contract verification

Branch: `feature/non-contract-workspace`, based on public UI `8a4fc38`. This record separates local proof from public release; release identity is recorded after commit.

## Real integrated workflow

Local browser `http://localhost:3999` → Next HttpOnly BFF → Go `127.0.0.1:8499` → dedicated PostgreSQL `pactra_e2e` port5546, runtime role with no schema ownership. All migrations0001–0004 applied.

Executed `scripts/workspace-e2e.mjs`, default UI-sign-in report run `2026-09-24T02-37-44-014Z-197aca3d`: passed. The separate `--api-auth` run `2026-09-24T02-38-52-379Z-6df120cc` also passed but does not test the Sign in button. Each report contains twenty named checks; UI sign-in claims below refer only to the default run:
- Buyer/worker UI wallet connection and SIWE sign-in using isolated injected EIP1193 TEST wallets and real ephemeral secp256k1 signatures. This is not browser-extension/hardware/mobile-wallet QA.
- Task creation through actual BFF after UI authentication; same key/body retry returns one task. The response was deliberately discarded, not a simulated network-outage claim.
- Cursor pagination through authenticated browser-cookie API.
- Worker accepts exact manifest in UI, submits a failing example, buyer requests revision, worker submits corrected version, buyer accepts that exact version.
- Historical idempotent replay plus fresh state readback, dispute evidence flag and terminal review boundaries.
- Outsider denied, account/network change clears access, revoked session rejected.
- Buyer/worker mobile layouts have no horizontal overflow; actual checker findings and history persisted. Task remains `accepted_unfunded`.

The initial harness incorrectly treated the designed permanent-dispute warning as an unexpected error; corrected harness distinguishes the explicit warning. Real application APIs were never mocked. No funds, real arbiters, customer data, public activity or AI assessments were fabricated.

## AI unavailable and budget integration

A separate real browser-cookie BFF flow with a fresh test identity verified unauthenticated401, valid signature session, three provider-unconfigured503 outcomes consuming daily reservations, fourth request429, and logout204. No Azure key was configured in this isolated server, so no provider cost or successful AI result is claimed.

## Additional gates

- Frontend unit suite/typecheck and Go race suites use actual tool outputs in final report.
- Official BOT mainnet settings read and `eth_chainId` verified; see NETWORK_VERIFICATION.md.
- Known npm advisories remediated to zero at check time; see DEPENDENCY_REMEDIATION.md.
- Full-schema encrypted restore and bounded cleanup covered by17Python tests; hosted pre-migration backup was separately encrypted and restored to a local isolated database. Production ACL/key-custody/scheduled recovery still need explicit verification.
- Independent final review passed after the Go/JS Unicode whitespace regression fix. Actual Go-generated POST/GET snapshots passed frontend parsers and isolated BFF/client transport tests. No blocking security or application-logic findings remained. A non-blocking suggestion remains: add sessions DELETE privilege coverage to the startup/readiness preflight; this is not evidence of a missing runtime grant. Browser evidence attribution was corrected against both saved reports.

## Deliberate limits

No contract/funding/payment/financial timeout, no arbiter dispute resolution, no publication of X posts or public repo visibility change. A dispute is a frozen evidence flag, not an adjudication. Production creation requires real consenting team arbiters. No private keys or session cookies belong in this repository or screenshots.
