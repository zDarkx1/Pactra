# Smart contract workstream

`src/PactraEscrow.sol` implements the owner-approved settlement decisions and is deployed on BOT Chain testnet (968) and mainnet (677); records in [deployments/](deployments/). It is **not independently reviewed**; the release gate in [settlement decisions](../docs/SETTLEMENT_DECISIONS.md) still requires independent review before any production financial guarantee. Never send BOT to an address from a demo placeholder.

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
- **Immutable terms:** the contract computes the manifest digest from chain, contract, parties, both arbiters, deployment attestor, protocol constants, nonzero agreement version/content hash and ordered complete deliverable configs, including absolute delivery deadlines. Single binding is scoped to this digest, so another buyer cannot squat raw content. No setters exist.
- **Replay binding:** EIP-712 domain `PactraEscrow` version `2` binds signatures to contract and chain. Receipts also bind task/index/round/manifest/artifact/expiry; bilateral settlements bind task/index/manifest/split/nonce/expiry.
- **Review window / timeout:** only a valid immutable designated evidence-attestor receipt can start a round's timer. The platform attests that the exact persisted artifact is accessible to the buyer; this is a trust assumption, not on-chain proof of access or quality. No buyer acknowledgement/veto. Each revision requires a round-bound receipt. Before review expiry the buyer may accept, request an allowed revision, or dispute. After buyer silence the worker must submit `claimTimeout`; nothing executes automatically.
- **No-submission refund:** buyer may refund only that allocation strictly after its agreed deadline if it was NEVER submitted. First submission is allowed through the exact deadline, not after; funding must precede every deadline. Revision-awaiting is not no-submission eligibility.
- **Both arbiters absent:** after recorded handover and backup's full 48 hours, `settleByAgreement` requires BOTH parties' valid signatures; anyone may relay. Otherwise funds remain locked. No unilateral or automatic split.
- **Revision limit:** bounded by the agreed per-deliverable limit; exhausting it leaves only accept, dispute or timeout.
- **Arbiter authority:** the primary arbiter can only split the disputed deliverable's allocation between buyer and worker (worker amount ≤ allocation) within 48 hours of the dispute. A permissionless `handoverDispute` after 48 hours revokes the primary's authority and starts the backup's own 48-hour window. No payment to arbiters, no access to other allocations.
- **Dispute blocks timeout payout:** a disputed deliverable cannot be claimed by timeout while the dispute is active.
- **Pull-based withdrawals:** settled value lands in withdrawable balances; `withdraw` uses checks-effects-interactions so reentrancy cannot double-spend and a failing receiver keeps its balance for a retry.
- **No admin surface:** no owner, no fees, no sweep/drain/pause path exists; value can only move along the settled allocations.

## Explicitly not implemented (unresolved policy — funds stay locked instead)

General post-funding cancellation; revision-deadline refunds; fees; worker reassignment; dependency-linked deliverables; open public claim tasks. The two narrowly approved exits above do not imply any broader cancellation or unilateral settlement authority.

## Layout

- `src/` reviewed Solidity (escrow only).
- `test/` unit, boundary, fuzz and invariant suites: lifecycle (`PactraEscrow.t.sol`), withdrawals/attackers (`PactraEscrowWithdrawal.t.sol`, `Attackers.sol`), invariant fuzzer with an adversarial handler (`PactraEscrowInvariants.t.sol`), plus the toolchain smoke test.
- `script/` explicit deployment entry point (`PactraEscrow.s.sol`); never run from CI.
- `deployments/` chain/address/ABI/source-commit records.

## Required test coverage

Existing lifecycle/withdrawal/invariant tests are retained and migrated to the breaking v2 ABI. Additional security suites test manifest squatting/configuration binding, receipt tampering/replay/expiry/canonical signatures, ERC-1271 validation, no-submission boundaries, bilateral-only fallback and conservation. See [contract verification](../docs/CONTRACT_VERIFICATION.md) for actual commands, RED/GREEN evidence and limitations. `FixtureAttestor` in legacy financial tests and the chain-31337-only demo is deliberately synthetic; never deploy it as a real accessibility attestor. Security tests and invariant handler also exercise deterministic EOA-signed fixture receipts, not live artifacts.

Generated integration ABI: `PactraEscrow.abi.json`. Constructor requires nonzero `evidenceAttestor`; deployment script reads the public address `EVIDENCE_ATTESTOR` without a default. Coordination spec: `/root/pactra-settlement-contract-interface.md` (local handoff).

## Deployment records

Tracked in [deployments/](deployments/):

- **Testnet** (BOT Chain Testnet, chainId 968): `0x65c928E9C8c102B3a95eE716AD0a32A5Bf6AE624` — [record](deployments/bot-testnet-968.json), [explorer](https://scan.bohr.life/address/0x65c928E9C8c102B3a95eE716AD0a32A5Bf6AE624).
- **Mainnet** (BOT Chain Mainnet, chainId 677): `0x2f4863b44c971dF701db831ae736Fdc0485B74DD` — [record](deployments/bot-mainnet-677.json), [explorer](https://scan.botchain.ai/address/0x2f4863b44c971dF701db831ae736Fdc0485B74DD).
Verify BOT Chain network/official router/token details at deployment time, not from a stale example. Never commit private keys, mnemonic, production RPC credentials or broadcast files with secrets.
