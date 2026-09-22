# Smart contract workstream — design only

No Solidity escrow or deployed contract exists in this starter. This is intentional: unresolved refund/dispute/timeout rules must not be hidden inside plausible-looking code. Never send BOT to an address from a demo placeholder.

Read [settlement decisions](../docs/SETTLEMENT_DECISIONS.md), [architecture](../docs/ARCHITECTURE.md) and [security](../docs/SECURITY.md).

## Planned layout
src/ for reviewed Solidity; test/ for lifecycle and invariants; script/ for explicit deployment; deployments/ for chain/address/ABI/source commit records. Create these with the first contract PR after selecting/pinning Foundry or Hardhat. No automatic deployment from CI.

## Contract responsibilities
Bind parties and immutable manifest/allocation versions; custody approved assets; enforce authorized acceptance, revision/dispute policy and timeout calls; allocate withdrawable balances; preserve accepted-deliverable independence; emit reconciliation events.

## Required tests
Unauthorized approval; duplicate claim/withdrawal; changed manifest; replay across task/chain/version; deadline equality; lost-response retry; no submission; absent arbiter; receiver revert; reentrancy; sum allocations/fees/refunds; residual rounding; no arbitrary admin drain; partial acceptance with dispute elsewhere.

## Deployment records
Testnet address: NOT DEPLOYED.
Mainnet address: NOT DEPLOYED.
Verify BOT Chain network/official router/token details at deployment time, not from a stale example. Never commit private keys, mnemonic, production RPC credentials or broadcast files with secrets.
