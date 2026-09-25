# Settlement end-to-end verification

2026-09-25, source working tree based on9bfd741. Local generated wallets only; no public funds.

## Real HTTP and chain
`node scripts/settlement-e2e.mjs --reset-db` passed13 checkpoints against fresh local Anvil, restricted PostgreSQL and actual Next BFF/Go. Evidence `/root/ui-research/pactra-settlement-e2e/2026-09-25T02-48-06-553Z-47f4b22d`.

Covered creation binding, foreign receipt rejection, funding, persisted signed availability, revision, stale consent rejection, participant/arbiter scoped evidence, primary/backup decisions, dual signatures after both windows, never-submitted deadline refund, withdrawals/conservation, and fail-closed removed chain history. Backend-only run also passed. BFF deliberately projects eligibility; full financial fields in the harness are read from the actual contract, not invented.

## Real UI and chain
`node scripts/settlement-ui-e2e.mjs --reset-db` passed25 checkpoints. Evidence `/root/ui-research/pactra-settlement-ui/2026-09-25T02-55-38-313Z-046d0f4d`.

Actual browser UI wallet controls and forms used genuine generated-wallet signatures, real backend/database and mined local transactions: buyer+worker login, invitation acceptance, escrow create/accept/fund, persisted submission, chain revision/second version, buyer acceptance, second-allocation dispute, primary arbiter evidence/resolution700/300, buyer/worker withdrawal. Gas-adjusted balances verified; escrow empty, task completed. No uncaught browser exceptions or unexpected workspace HTTP errors.

The first UI attempt incorrectly auto-connected the synthetic wallet before the connect control; harness corrected. The next run exposed cached getBlockNumber causing post-transaction authoritative readback to observe a pre-send block. Production reader now always bypasses head cache; the entire UI flow then passed.

## Limits
Injected local wallet is not MetaMask/WalletConnect mobile device QA. No public testnet, mainnet, timeout UI, backup UI or bilateral UI mined-flow claim from this UI run. Backup/bilateral/refund mined flows are covered by the separate actual HTTP/chain harness; bilateral component cryptography and confirmation separately tested. Read-only full-contract review still separate. No formal audit implied.
