# Contract security verification — settlement integration v2

## APP-03 follow-up: atomic review consent

This section supersedes the earlier financial-selector, source/ABI hash, test-total and size statements below. Only APP-03 is addressed here; original policy and bilateral settlement are unchanged.

Mandatory breaking review signatures (no unguarded overloads):

    acceptDeliverable(uint256,uint256,uint256,bytes32,uint64)
    requestRevision(uint256,uint256,uint256,bytes32,uint64)
    openDispute(uint256,uint256,uint256,bytes32,uint64)

Arguments after task/index are expectedRound, expectedArtifactHash, expectedSubmittedAt. Storage must match all three atomically before the action changes status or credits funds, otherwise ReviewEvidenceChanged(). Round is uint256(revisionsUsed)+1. No external calls occur between comparison and mutation. Existing role, window, revision-limit and financial policy checks remain. Old selectors revert. Getters/events/EIP-712/bilateral signatures are unchanged.

UI copies/freeze-displays these values from the confirmed review allocation; it never substitutes a fresh round for a held confirmation. Final preflight checks confirmed and uncached latest snapshots and simulates guarded calldata. A changed snapshot blocks the wallet and asks for renewed review. The same calldata guards mining after the wallet opens. Readback checks the expected evidence transition, and receipt calldata validation remains required.

Actual TDD: original two-argument acceptance calldata, frozen in round one, successfully paid for replacement round two; the new regression failed with `stale round-one consent paid for round two`. After implementation, that scenario using guarded calldata reverts with the exact custom error and fresh round-two consent succeeds. Fuzz tests cover all three actions, each mismatching guard, either dispute participant, identical artifact and same-timestamp resubmission, and absent legacy selectors.

Verification artifacts in contracts/verification/:
- app03-red.log: foreground pre-fix failure transcribed from actual tool output (not a raw redirected log).
- app03-green.log: full forge test --offline --fuzz-runs 1024 --fuzz-seed 0x706163747261 -vv; 108 passed, zero failures/skips, including invariants (64 runs, 12800 calls, zero reverts).
- app03-frontend-red.log: three held-confirmation tests failed before service fix with Missing expected rejection.
- app03-frontend-green.log: 34 service/transaction/ABI/arbiter/bilateral tests pass, zero failures/skips; full npm run typecheck passes.
- app03-build.log: offline full build (including migrated Demo) passes; runtime 12013 bytes, initcode 12198 bytes. Existing lint warnings remain visible.
- app03-abi-fresh.json: fresh forge inspect output byte-equals contracts/PactraEscrow.abi.json; frontend ABI generated from that file and exact parity tested.
- app03-browser.log: `node tests/review-consent-browser.mjs` passes all three review actions using real TaskOnchain/confirmation/service DOM. Shows frozen round/hash/submittedAt, replaces mocked RPC evidence while open, observes zero wallet/simulation calls, refreshes and requires a new acknowledgement, then decodes exact guarded round-two calldata. Mocked BFF/RPC/wallet; mining is covered separately by Solidity tests, not this browser fixture.
- app03-backend-evm.log: `go test ./internal/workspace -run '^TestLocalEVM(ReconcileAndAvailability|DeadlineCappedAvailability)$' -v -count=1` passes both tests (package 1.093s). Ephemeral loopback Anvil and isolated pactra_settlement_backend DB on local PostgreSQL 5546; validates migrated revision/dispute calls against actual ABI. Existing APP-01/02 fixes were exercised, not authored by this workstream.

All existing Solidity tests, stateful handler and Demo calls migrated. Backend EVM test helper supplies real snapshot fields and requires five-input ABI; no backend production edits by consent workstream. Parent/data/bilateral interface: /root/pactra-settlement-contract-interface.md.

Current SHA-256:

    src/PactraEscrow.sol 70ce983acc3a7115f7118bc90c65b807b9489f21f38cf7332e124d4dad29930f
    PactraEscrow.abi.json 800658d4795e28a125ca1563c8e45c7bf46e82fb35bc362c8ba1486d226b9888

No live network, secret access, public deployment, release approval or unrelated policy changes. Independent contract-review JSON was absent; reviewer log reports provider safety-filter termination rather than a completed review. This is not an independent audit.


Status: IMPLEMENTED AND LOCALLY EXERCISED; NOT DEPLOYED, NOT AUDITED, NOT AUTHORIZED FOR REAL FUNDS.

Base: `9bfd741`, branch `feature/settlement-integration`. This workstream changed only `contracts/**`, this document, and the requested external handoff/result files. Concurrent backend/frontend/policy edits were observed but not changed by this workstream. No commits, pushes, DB access, production secrets, public deployment or real-fund operations.

## Implemented policy and security changes

- Contract-computed EIP-712 manifest identity replaces opaque caller-provided global hash binding. Domain is `PactraEscrow`, version `2`, current chain and escrow address. Manifest includes buyer, worker, both arbiters, immutable deployment evidence attestor, arbiter window, deliverable bound, supplied chain/version/content hash and ordered full configs. Creation rejects a wrong execution chain, zero version/content, invalid configs and duplicate scoped digest. Other buyers can reuse content but cannot occupy the original buyer's digest.
- Each allocation has an absolute `uint64 deliveryDeadline` agreed at creation and accepted before funding. Funding must occur strictly before every deadline. First submission is allowed through deadline equality, not after: there is no post-deadline transaction-order race that can defeat an eligible refund. Buyer alone can `refundUnsubmitted` strictly after deadline, only if that allocation has NEVER submitted. A persistent `everSubmitted` flag survives revisions. No revision-awaiting refund or general cancellation is introduced.
- Submission/revision timer starts only with designated attestor's unexpired signed receipt binding domain, task, index, round, computed manifest, artifact hash and expiry. Zero artifact and malformed/wrong/replayed signatures fail. The old two-argument submission selector no longer exists. Buyer acknowledgement is not required and cannot veto the timer. Latest evidence is readable; events retain round history.
- After a recorded backup handover and its full 48-hour window elapses, `settleByAgreement` requires valid signatures of BOTH parties on the same domain/task/index/manifest/worker award/nonce/expiry. The remainder refunds buyer. Relaying is permissionless; missing/invalid signatures leave funds locked. Success consumes the nonce and terminal state prevents replay. No unilateral split, automatic half-split or new arbiter/admin authority.
- EOA signatures require canonical 65-byte low-s ECDSA with v=27/28; contract signers use ERC-1271 STATICCALL and canonical magic return. Both evidence receipts and bilateral settlement support these paths.
- Exact full native funding, per-allocation independence, original review/revision/arbiter windows, primary revocation upon handover, pull withdrawals, failed-withdrawal retry and no fee/admin drain remain.

## Integration artifacts

Complete generated ABI: `contracts/PactraEscrow.abi.json`.
Local coordination spec, published before implementation and finalized afterward: `/root/pactra-settlement-contract-interface.md`.

Breaking calls:

    constructor(address evidenceAttestor)
    createTask(address,address,address,uint256,uint64,bytes32,(uint128,uint16,uint64,uint64)[])
    submitDeliverable(uint256,uint256,bytes32,uint64,bytes)

New settlement exits:

    refundUnsubmitted(uint256,uint256)
    settleByAgreement(uint256,uint256,uint128,uint64,bytes,bytes)

Existing `getTask`, `getDeliverable`, original financial calls and original events retain signatures. New getters expose manifest version/content and deadline/evidence; new events distinguish refunds, receipts and agreements. See complete ABI/spec for types, errors, exact EIP-712 encoding and boundary semantics. ABI was regenerated with `forge inspect PactraEscrow abi --json` and byte-compared to a fresh inspection successfully.

SHA-256:

    src/PactraEscrow.sol
    7a020645ca83470b72b95eee9d16b0cea0602b5318d3f995bcf43cf773919ef3
    PactraEscrow.abi.json
    fbf606b3bf46747319c90cfaffd54e1ff7c43c6fafabb7102634945aceac03f4

## Actual toolchain provenance

Forge was absent from PATH. Downloaded pinned official release via HTTPS, no curl-to-shell:

    https://api.github.com/repos/foundry-rs/foundry/releases/tags/v1.8.3
    https://github.com/foundry-rs/foundry/releases/download/v1.8.3/foundry_v1.8.3_linux_amd64.tar.gz
    https://github.com/foundry-rs/foundry/releases/download/v1.8.3/foundry_v1.8.3_linux_amd64.sha256

Archive SHA-256 matched BOTH GitHub API asset digest and official checksum file:

    7ca48e6ca3cac1bce1403ca67e5bc1dc3bc1fd818199c9957c7165079c228568

Archive extraction outside the project was blocked by runtime policy; extraction into local ignored `contracts/.toolchain/` succeeded. No global install. API metadata and checksum are retained in `contracts/verification/`. This is HTTPS/official checksum verification, not independent Sigstore identity verification.

Actual binary output:

    forge Version: 1.8.3
    Commit SHA: cae51ad458f6abb64852b7709eb784352429825d
    Build Timestamp: 2026-09-15T10:46:16.519267388Z (1789469176)
    Build Profile: dist

Compiler 0.8.37; optimizer enabled, 200 runs; no via-IR workaround. Existing forge-std submodule is v1.16.2 at `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`.

## Executed RED/GREEN and fuzz/invariant checks

Commands below run from `contracts/`; binary is `.toolchain/forge`.

1. BEFORE source fixes, added executable regression tests against original ABI:

       .toolchain/forge test --match-contract SecurityRegressionTest -vv

   Actual exit 1, 0 passed, 3 failed:

       [FAIL: approved no-submission refund missing]
       [FAIL: unattested submission started timer]
       [FAIL: ManifestAlreadyBound()]

   Full original output: `contracts/verification/red.log`. These tests remain, with creation fixture migrated to v2 ABI. RED establishes those three behaviors, not a claim that every later test was run before implementation.

2. Full final suite, including original tests and new cryptographic/boundary tests:

       .toolchain/forge test --fuzz-runs 1024 --fuzz-seed 0x706163747261 -vv

   Actual exit 0:

       Ran 7 test suites: 104 tests passed, 0 failed, 0 skipped (104 total tests)
       PactraEscrowInvariants invariants (runs: 64, calls: 12800, reverts: 0)

   Full output: `contracts/verification/green.log`. Foundry groups five invariant properties as one runner result. `PactraContractSignatureTest` inherits and reruns the 17 security tests plus two ERC-1271 tests; 104 is Foundry's executed count, not 104 distinct test bodies.

3. Extended stateful invariants:

       FOUNDRY_INVARIANT_RUNS=256 FOUNDRY_INVARIANT_DEPTH=500 \
         .toolchain/forge test --match-contract '^PactraEscrowInvariants$' \
         --fuzz-seed 0x706163747261 -vv

   Actual exit 0:

       PactraEscrowInvariants invariants (runs: 256, calls: 128000, reverts: 0)
       2 tests passed, 0 failed, 0 skipped

   Full output: `contracts/verification/invariants.log`. `fail_on_revert=true`; invalid receipts and unilateral settlement attempts are explicitly called and asserted rejected. Eligible actions update ghost deposits/awards/refunds/withdrawals. Five properties cover conservation, ghost balances, split sums, terminal state and evidence/arbiter balances. Selector call counts include eligibility no-ops; a separate passing non-vacuity test proves successful refund AND signed agreement through the same handler, withdrawals, zero residual and all five properties.

4. Formatting/build/ABI verification:

       .toolchain/forge fmt --check
       .toolchain/forge build --sizes
       .toolchain/forge inspect PactraEscrow abi --json
       git diff --check

   Passed. PactraEscrow runtime 11,856 bytes, initcode 12,041 bytes; runtime margin 12,720 bytes. Full build/lint output: `contracts/verification/build.log`.

An intermediate test compilation hit stack-too-deep in a new fuzz test, fixed by reducing fixture locals without changing compiler mode. Increasing fuzz runs found a harness issue: `vm.chainId` cannot accept a value >=2^64. Its mutation is now bounded within cheatcode-supported space; the retained original digest fuzz test still exercises uint256 chain inputs. The same failing seed was rerun successfully. No tests were deleted or disabled. One old no-submission test was renamed to describe pre-deadline lock behavior; its assertions remain.

## Trust assumptions and limitations

- A signature proves the configured attestor asserted availability, not that a server stored data or that buyer networking works. Platform must verify persistence, exact content hash, correct task/index/round, buyer ACL/retrievability and retention through review/dispute before issuing receipts. Attestation expiry is the submission-use deadline, NOT a retention guarantee. Use short issuance-to-use expiry and durable retention operationally.
- Attestor compromise can falsely start a review timer; censorship/outage/lost signing ability can prevent timely first submission and expose worker to deadline refund. Immutable address has no rotation/admin bypass; a contract attestor may itself have mutable signer policy. This is explicit centralized trust, not trustless availability. Buyer cannot withhold acknowledgement to prevent a valid receipt submission. AI is not an attestor or payout authority.
- Contract binds `contentHash` and configs together but cannot parse off-chain manifest bytes to prove their semantic consistency. Both parties must compare immutable canonical manifest content, all configs, chain, contract and attestor before accepting/funding. Domain agreement version is distinct from manifest revision.
- If backup handover is never recorded, its timer never starts. If backup misses its window and either party refuses/loses signing capability, funds remain locked by approved policy. Awaiting revisions have no new deadline/refund policy. No unilateral escape is hidden in this implementation.
- No production receipt service, real persisted artifacts, wallets with real funds, public RPC, testnet flow or deployment was exercised. Legacy lifecycle/withdrawal tests and local-only Demo use an explicitly synthetic ERC-1271 attestor. Cryptographic suites/invariant handler use deterministic LOCAL fixture keys. Demo was updated/compiled, not broadcast.
- Build reports timestamp-comparison and uint64 timestamp-cast warnings, bounded-loop reverts, event-after-external-call warnings and test-only mutability/unused-local/environment-cheatcode warnings. ERC-1271 calls are STATICCALL (cannot change state or emit logs), so those event warnings do not indicate a stateful signer callback. Withdrawal CEI/reentrancy tests remain green. Timestamp types and original arbiter sentinel behavior assume ordinary chain timestamps, not adversarial values beyond uint64. These warnings remain visible, not suppressed.
- Stateful verification is bounded, not a formal proof. No independent audit, symbolic execution, forced-native-currency invariant campaign or production contract-wallet integration was performed. Forced unsolicited native currency can create unallocated residual; no sweep authority was added.
- Release still requires policy signoff, independent Solidity review, deployment-chain compatibility verification (including compiler EVM target), real two-wallet testnet exercise and explicit release approval. Green local checks never authorize real funds.
