# Smart contract workstream — design only

No Solidity escrow or deployed contract exists in this starter. This is intentional: unresolved refund/dispute/timeout rules must not be hidden inside plausible-looking code. Never send BOT to an address from a demo placeholder.

Read [settlement decisions](../docs/SETTLEMENT_DECISIONS.md), [architecture](../docs/ARCHITECTURE.md) and [security](../docs/SECURITY.md).

## Toolchain

Foundry is pinned as the contract toolchain: Foundry v1.8.3 (forge, cast, anvil), solc 0.8.37 and forge-std v1.16.2 (git submodule at lib/forge-std). After cloning, run `git submodule update --init --recursive` before testing. Local toolchain version changes require updating this pin, foundry.toml and CI together.

```bash
cd contracts
forge fmt --check
forge build --sizes
forge test
```

test/Toolchain.t.sol is a toolchain smoke test (compile, test runner, fuzz engine), not product logic. src/ for reviewed Solidity, script/ for explicit deployment and deployments/ for chain/address/ABI/source-commit records are created with the first contract PR. No automatic deployment from CI; CI runs formatting, build and tests only.

## Contract responsibilities
Bind parties and immutable manifest/allocation versions; custody approved assets; enforce authorized acceptance, revision/dispute policy and timeout calls; allocate withdrawable balances; preserve accepted-deliverable independence; emit reconciliation events.

## Required tests
Unauthorized approval; duplicate claim/withdrawal; changed manifest; replay across task/chain/version; deadline equality; lost-response retry; no submission; absent arbiter; receiver revert; reentrancy; sum allocations/fees/refunds; residual rounding; no arbitrary admin drain; partial acceptance with dispute elsewhere.

## Deployment records
Tracked in [deployments/](deployments/): testnet NOT DEPLOYED, mainnet NOT DEPLOYED.
Verify BOT Chain network/official router/token details at deployment time, not from a stale example. Never commit private keys, mnemonic, production RPC credentials or broadcast files with secrets.
