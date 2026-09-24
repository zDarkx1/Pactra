# Smart contract workstream

`src/PactraEscrow.sol` is a source-only implementation of the owner-approved settlement decisions. It is **not deployed, not independently reviewed, and not authorized to hold funds**; deployment is blocked by the release gate in [settlement decisions](../docs/SETTLEMENT_DECISIONS.md). Never send BOT to an address from a demo placeholder.

Read [settlement decisions](../docs/SETTLEMENT_DECISIONS.md), [architecture](../docs/ARCHITECTURE.md) and [security](../docs/SECURITY.md).

## Toolchain

Foundry is pinned as the contract toolchain: Foundry v1.8.3 (forge, cast, anvil), solc 0.8.37 and forge-std v1.16.2 (git submodule at lib/forge-std). After cloning, run `git submodule update --init --recursive` before testing. Local toolchain version changes require updating this pin, foundry.toml and CI together.

```bash
cd contracts
forge fmt --check
forge build --sizes
forge test
```

## What the escrow implements

Every item below maps to an owner-approved decision in [settlement decisions](../docs/SETTLEMENT_DECISIONS.md):

- **Designated worker:** the buyer names one worker; the worker must `acceptTask` before funding. Self-invitation (worker == buyer) is rejected.
- **Upfront full funding:** `fundTask` requires the worker's acceptance and the exact total allocation; nothing else can move value into the contract (no receive function).
- **Per-deliverable independence:** each deliverable settles on its own (accept, dispute resolution or timeout) while others stay untouched.
- **Immutable terms:** manifest hash, allocations, revision limits and review windows are fixed at creation; there are no setters, and a manifest hash can only ever be bound to one task.
- **Replay binding:** `manifestDigest` binds manifest content to chain id and version, so an agreement cannot be replayed across chains or versions.
- **Review window / timeout:** the window starts only when a submission round is recorded. Before the deadline the buyer may accept, request an allowed revision, or dispute. After buyer silence the worker must submit a `claimTimeout` transaction; the contract never acts on its own.
- **Revision limit:** bounded by the agreed per-deliverable limit; exhausting it leaves only accept, dispute or timeout.
- **Arbiter authority:** the primary arbiter can only split the disputed deliverable's allocation between buyer and worker (worker amount ≤ allocation) within 48 hours of the dispute. A permissionless `handoverDispute` after 48 hours revokes the primary's authority and starts the backup's own 48-hour window. No payment to arbiters, no access to other allocations.
- **Dispute blocks timeout payout:** a disputed deliverable cannot be claimed by timeout while the dispute is active.
- **Pull-based withdrawals:** settled value lands in withdrawable balances; `withdraw` uses checks-effects-interactions so reentrancy cannot double-spend and a failing receiver keeps its balance for a retry.
- **No admin surface:** no owner, no fees, no sweep/drain/pause path exists; value can only move along the settled allocations.

## Explicitly not implemented (unresolved policy — funds stay locked instead)

Post-funding cancellation; a buyer exit when nothing was ever submitted; an exit when the backup arbiter also misses its deadline; fees; worker reassignment; dependency-linked deliverables; open public claim tasks. These gaps are deliberate: unresolved rules must not be hidden inside plausible-looking code.

## Layout

- `src/` reviewed Solidity (escrow only).
- `test/` unit, boundary, fuzz and invariant suites: lifecycle (`PactraEscrow.t.sol`), withdrawals/attackers (`PactraEscrowWithdrawal.t.sol`, `Attackers.sol`), invariant fuzzer with an adversarial handler (`PactraEscrowInvariants.t.sol`), plus the toolchain smoke test.
- `script/` explicit deployment entry point (`PactraEscrow.s.sol`); never run from CI.
- `deployments/` chain/address/ABI/source-commit records.

## Required test coverage

Implemented in the suites above: unauthorized approval; duplicate claim/withdrawal; changed manifest (immutability plus single binding); replay across task/chain/version; deadline equality (buyer acts at the exact deadline, worker only strictly after; primary and backup arbiter window boundaries); lost-response retry (failing receiver keeps its balance); no submission (funds lock by design); absent arbiter (rejected at creation); receiver revert; reentrancy (try/catch re-attacker); sum of allocations/refunds (fuzz + invariant); residual value (zero after full settlement and withdrawals); no arbitrary admin drain; partial acceptance with a dispute elsewhere.

## Deployment records

Tracked in [deployments/](deployments/): testnet NOT DEPLOYED, mainnet NOT DEPLOYED.
Verify BOT Chain network/official router/token details at deployment time, not from a stale example. Never commit private keys, mnemonic, production RPC credentials or broadcast files with secrets.
