# Onchain frontend integration

Scope: `frontend/**`. No deployed escrow, production signer, migration, live funds, package installation, lockfile changes or release authorization are supplied by this work.

## Entry points

- `/tasks/[id]`: existing immutable workspace terms and voluntary evidence review remain available. A separate onchain panel reads authenticated deployment configuration before mounting wallet transaction controls.
- `/arbiter`: public-safe introduction and session gate, linked from desktop/mobile/collapsed app-shell navigation. No private queue/evidence request before sign-in. Backend nomination/dispute ACL determines case visibility; there is no UI role selector.
- Missing/disabled/invalid deployment explicitly disables financial controls. It does not manufacture a contract address, balance, task binding, workload count or receipt.

## Contract and transaction boundary

`lib/escrow-abi.ts` is generated from the contract worker's `contracts/PactraEscrow.abi.json`. `tests/generate-escrow-abi.mjs` regenerates only the frontend copy; an exact parity regression prevents selector drift. No legacy bare-hash creation or two-argument submission is used.

Creation maps the accepted manifest's SHA-256 content hash, version, participants and ordered allocations into v2 `createTask`. Each allocation uses the immutable common delivery deadline. Fractional seconds, uint128 overflow and mismatched totals fail rather than rounding accepted terms. Creation, worker acceptance and exact-total buyer funding are separate transactions.

Before each send:

1. Re-read authenticated `/onchain/config`; require unchanged trusted deployment.
2. Match connected wallet, signed-in session and RPC chain; require contract code.
3. Read verified backend binding, contract manifest digest, participants, content/version, ordered amounts/revision limits/review windows/deadlines. Task snapshots use a confirmation-adjusted block and recheck canonical block hash.
4. Freeze explicit consent; run actual RPC `eth_call` simulation against the configured escrow. The contract remains authoritative for role/status/deadline/attestation checks.
5. Request wallet transaction once. Wait for configured receipt confirmations. Verify receipt transaction sender, target, calldata and value (a cancellation or unrelated replacement is not success).
6. Read back authoritative state before showing success. Creation also reconciles the canonical creation receipt with the backend.

Lifecycle distinguishes preflight blocked, wallet confirmation, broadcast/pending receipt, confirming readback, rejected, reverted, uncertain and success. Receipt timeout/readback failure is uncertain, never success or an automatic resend. Manual receipt check does not send another wallet transaction. Existing creation hash can be manually reconciled. Transaction intents synchronously dispose on workspace identity invalidation, and private React subtrees remount on session/account changes. Already-broadcast transactions cannot be cancelled by logout.

Implemented controls: create, worker acceptance, exact funding, attested submission, buyer acceptance/revision, participant dispute, worker review timeout, never-submitted buyer refund, permissionless recorded handover, bilateral agreement signing/exchange/relay, pull withdrawal; arbiter split resolution and handover in scoped cases. Buttons are convenience gates; simulation and contract execution enforce authority.

Availability requires the exact persisted artifact version/hash displayed in confirmation. The service re-reads it, rejects changed consent, obtains the backend receipt, checks task/index/round/chain/escrow/manifest/hash and cross-checks `submissionDigest` before encoding the v2 submission. Attestor signatures confirm inline artifact availability/integrity, not quality; missing signer disables submission.

## Arbiter evidence and authority

The backend now supplies scoped lifecycle evidence. Only one disputed deliverable and its events are projected. The actual task ID/index is decoded from the published ABI's receipt-linked `DisputeOpened`, not guessed or entered by a user. Before enabling resolution, the frontend verifies the receipt/log emitter and canonical block, confirmation depth, manifest content, allocation terms, current contract nomination and block-time window.

Primary/backup nomination alone is not active authority. Recorded handover revokes primary authority and starts the backup window. Split input is integer native base units; worker award plus buyer refund exactly equals the allocation. Confirmation displays task/index, chain/contract, manifest, both recipients and both amounts. Resolution credits pull balances, not immediate wallet transfers. No arbiter fee is invented.

Workspace-only disputes stay readable but financial controls remain disabled without linked chain evidence. Chain-only disputes can expose local `submitted` history without fabricating a local dispute. Empty candidate pages can still have `next_cursor`; the UI offers the next page.

## Bilateral settlement after missed backup window

The task allocation panel exposes `BilateralAgreement` only for a disputed allocation after a recorded handover and strictly more than 48 hours of backup time. It does not start the handover automatically or offer a unilateral fallback. Refresh chain state after the window. Without both parties' valid signatures, funds remain locked.

1. Enter the worker award in integer native base units and expiry in integer Unix **seconds**, UTC. No float conversion or default split/expiry is supplied. Zero or full allocation awards are allowed only with both parties' consent.
2. Prepare a proposal from verified immutable terms and current RPC state. Review chain, verifying contract, onchain task ID, zero-based allocation index, contract manifest digest, content hash, both recipient addresses, exact worker award and derived buyer refund, nonce, expiry and digest.
3. A separate acknowledged Radix dialog requests wallet `signTypedData`, never `personal_sign` or a private key. The exact EIP-712 domain is `PactraEscrow`, version `2`, current chain ID and escrow address. The exact primary type is `Settlement(uint256 taskId,uint256 index,bytes32 manifestHash,uint128 workerAmount,uint256 nonce,uint64 expiry)`. `manifestHash` means the contract manifest digest, **not** the workspace content hash. Buyer refund is immutable allocation minus workerAmount; it is displayed but is not an invented signed field.
4. Copy the lossless JSON export to the other party through an independently chosen channel. They paste, validate, inspect and sign the same proposal, then return the combined JSON. Numeric message fields are decimal strings on export; wallet values are exact bigints. No signature/private key is uploaded to the backend. No localStorage signature persistence is used. Unexpected fields, formats, overflow, wrong target/domain/nonce or invalid signatures fail closed. Pasting a replacement clears the previous usable proposal before validation.
5. Relay is disabled without both validated signatures and requires a second explicit transaction confirmation. The existing transaction service rechecks deployment/session/account/chain, fresh proposal validity and both signatures, simulates `settleByAgreement`, requests one wallet transaction and verifies the receipt's sender/target/calldata/value. Readback requires the exact settled award/refund and consumed nonce before success. Rejection, revert and uncertain outcomes retain the existing no-auto-retry behavior.

Signing and validation use an uncached latest block number, block-pinned immutable state/nonce/domain/digest reads, canonical block checks, and current chain time. EOA signatures require actual recovered party addresses and the contract's 65-byte, low-s, v=27/28 format. Deployed contract accounts use RPC ERC-1271 calls with the escrow as caller and the exact padded magic return; final escrow simulation enforces its STATICCALL semantics. Unsupported/counterfactual signatures are not implicitly accepted. The service permits an arbitrary relayer with both signatures; the task page still retains existing buyer/worker backend visibility ACLs. There is no backend role override or new signing endpoint.

Expiry is inclusive at the exact onchain second and invalid afterwards; wall-clock time cannot grant eligibility. Signing is an authorization, not login or payment: anyone possessing both signatures may relay until expiry. Closing the dialog, logout or discarding local JSON does **not** revoke already issued/shared signatures. Session changes discard pending results locally but cannot cancel an already broadcast transaction. Signing and proposal import never automatically relay or withdraw; settlement only credits pull balances.

## BFF and local evidence

Existing exact-origin POST, bearer-in-HttpOnly-cookie, live-wallet address/chain match, no-store/private headers and error sanitization remain intact. Only these new route shapes are allowed:

- GET `/onchain/config`
- GET `/arbiter/disputes` (bounded limit/cursor only)
- GET `/arbiter/tasks/{uuid}/deliverables/{slug}/evidence`
- GET `/tasks/{uuid}/onchain`
- POST `/tasks/{uuid}/onchain/reconcile`
- POST `/tasks/{uuid}/deliverables/{slug}/onchain/availability`

Responses use field-by-field validation/projection. No signing keys, RPC credentials, arbitrary backend targets or generic signing endpoints are relayed. Availability signatures are public transaction inputs, not signing secrets.

Local `accepted_unfunded` is labeled as workspace state, not a deposit claim. Existing evidence idempotency/raw artifact preservation remains. Backend-authorized chain revisions permit the next persisted submission without inventing a local buyer revision; `chain_revision` metadata is strictly parsed and terminal accepted/disputed local histories remain terminal. Read eligibility never grants transaction authority.

## Verification and limitations

Commands (existing installed dependencies only):

    npm run typecheck --workspace=frontend -- --incremental false
    npm test --workspace=frontend
    node frontend/tests/onchain-browser.mjs
    node --experimental-strip-types frontend/tests/onchain-agreement-browser.mjs
    git diff --check -- frontend

New TDD red/green runs cover transaction lifecycle/disposal, strict routes/config, ABI parity, exact amounts/deadlines, immutable binding/funding, replacement transaction checks, frozen artifact consent, withdrawal consent, scoped arbiter event binding and local chain-revision compatibility. Additional mocked service tests exercise role/window/foreign-log rejection. The standalone Chromium test bundles actual owned components into a temporary directory, never shared `.next`; it checks signed-out privacy, exact queue/config fetches, disabled deployment, Radix consent and logout teardown with explicitly mocked provider/backend. It is not a real wallet/backend/EVM end-to-end test or CSS visual QA.

Remaining release work:

- Run real browser wallet + deployed local escrow + backend integration across all transaction outcomes, revision rounds and arbiter handover/resolve. Unit/service RPC fixtures are not real receipts.
- Bilateral service tests execute actual local viem EIP-712 signing/recovery with public deterministic test keys and an independent Solidity-style ABI digest calculation. RPC/backend/1271 responses are fixtures, not real chain observations. The bilateral Chromium test bundles real task/consent components, signs with local viem fixtures, tests exchange, missing/foreign signatures, nonce-race preflight, wallet rejection and logout disposal. It is not deployed-wallet/EVM integration; that remains the separate E2E workstream.
- No full task lifecycle event timeline is rendered. Financial states are independent contract reads; the projected backend lifecycle subset supports revision eligibility. Account-wide withdrawal is not attributed to a task.
- No approved production deployment/codehash is supplied. Code presence, trusted backend config, immutable terms and canonical RPC reads are checked, but one configured RPC/deployment remains a trust boundary.
- Receipt tracking is in memory and clears on route/session teardown. Creation-hash reconciliation exists; generic resumed transaction tracking after reload is not implemented. Review the wallet/chain before a new action after an interrupted view.
- Production CSS visual/accessibility QA and real account/chain-switch wallet QA remain. Existing shell/motion code and Radix confirmation primitives are retained; no shared dev server was started and no build ran.

Parent owns packages, release/preflight, final integration review and commits. See `/root/pactra-settlement-frontend-result.md` for the earlier integration report and `/root/pactra-settlement-bilateral-result.md` for the bilateral completion evidence and remaining E2E limitations.
