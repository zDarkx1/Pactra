# Submission package — evidence required before publication

This is a preparation checklist, not a completed submission. Do not submit, publish an account/post, change repository visibility, deploy a contract or spend funds without the owner's separate authorization.

## Current evidence boundary

- Main UI PR #2 is merged at `9bfd741`, confirmed in the local checkout. This is source provenance, not proof of the current live served revision.
- Real arbiters have been supplied by the user. Do not repeat older statements that their addresses are missing, and do not invent replacements. Public configuration, consent and any on-chain role/activity still require verification.
- Local source, tests and the offline hosted-backup suite are implementation evidence. The backup suite uses synthetic subprocess output and real cryptography, not a hosted database connection or hosted restore.
- Public full on-chain operation remains absent/unverified. No contract deployment address, transaction, funded task, user account, explorer receipt, project social account or completed competition entry is claimed by this package.
- Testnet and mainnet evidence must be separate. Local Anvil/Foundry fixture addresses and synthetic tasks must never be represented as real public activity.

## Package contents and evidence ledger

Maintain a reviewed release revision and an operator-held ledger. Public exports must exclude passwords, runtime URLs, keys, session tokens, customer documents, internal logs and unapproved account details.

| Item | Evidence to attach after verification | Current disposition |
| --- | --- | --- |
| Project summary | Plain-English problem, buyer/worker flow, deterministic vs advisory AI checks and settlement limitations | Draft from repository product docs; owner review pending |
| Source and license | Owner-approved accessible repository URL, reviewed release revision, README, license decision and build instructions | PR #2 merge `9bfd741` confirmed locally; judge access/license approval not established here |
| Live site | Approved custom-domain URL, actual deployed revision and successful wallet/main-action recording | Fresh public verification pending; no invented URL |
| Contracts | Solidity source/compiler/toolchain, tests, review limitations and bytecode/source verification | Final release evidence pending; source presence is not deployment |
| Testnet deployment | Network/chain ID, actual contract address, constructor settings, deployment receipt and explorer link | Pending; no address or receipt supplied by this pass |
| Testnet activity | Genuine lifecycle transaction receipts, relevant events and state readback | Pending; do not substitute local fixture transactions |
| Mainnet deployment/activity | Separate authorization, actual deployment/transaction receipts, network and state readback | Pending; not inferred from testnet |
| Arbiter setup | Privately reviewed supplied wallets, consent and exact configured/deployed values | Real inputs supplied; final public/deployed readback pending |
| Operations | Actual hosted backup run, isolated restore evidence, monitoring/timer status and recovery owner | Wrapper and offline tests available; parent owns live configuration/run/restore |
| Demo | Recording of the actual approved network and deployed UI revision; visible chain and transaction status | Pending; label unfunded/private/local behavior accurately |
| Project social account/posts | Owner-approved real account URL and actual qualifying post URLs with timestamps | Pending; no account or post invented or published |
| Launch write-up/branding | Approved factual mainnet launch article and verified BOT Chain/explorer links | Pending until real launch and branding review |

For each real chain action record: network name and chain ID, purpose, actual contract address, transaction hash, block/receipt success, explorer URL, relevant state readback and verification time. Failed/reverted or simulated transactions are not successful activity. Keep private actor/account details out of public exports unless disclosure is approved.

## Organizer requirements — reconfirm live

[HACKATHON.md](HACKATHON.md) records previously inspected organizer references:

- https://www.girlmeetstech.org/guidebook-build-week-hackathon-vol2
- https://www.girlmeetstech.org/article-bwh-winners

That historical inspection listed a September25,2026 23:59 GMT+7 deadline with conflicting weekday labels. This ops pass did not fetch or confirm the current rules/deadline. Ask organizers or verify their current primary publication before relying on it. Do not assert eligibility or a predicted score from a prepared checklist.

Previously recorded requirements, each needing current-rule confirmation and actual evidence:

- [ ] BOT Chain contract address with real activity.
- [ ] Live custom-domain website with usable wallet/main action; confirm any subdomain exception directly.
- [ ] Accessible GitHub Solidity source and plain-English README including separately labeled testnet/mainnet deployment addresses.
- [ ] Real project-specific X account/post tagging `@BOTChain_ai`.
- [ ] At least five qualifying posts within the required thirty-day window; verify actual timestamps, URLs and applicability.
- [ ] Official BOT Chain Mainnet launch write-up grounded in a real launch, not a testnet or planned deployment.
- [ ] BOT Chain branding with approved links to `botchain.ai` and the correct explorer.

## Release-to-submission review

1. Complete the distinct local, live, testnet and mainnet gates in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Record omissions explicitly.
2. Review source, build/test output and any independent security-review limitations for the exact combined release revision. This bounded ops work does not certify unrelated application/contract edits.
3. Verify each public URL and each contract/receipt on the intended network. Obtain a real wallet/browser run from authorized participants; supplied arbiters alone do not prove a lifecycle.
4. Ensure the demo distinguishes objective checks, advisory AI, buyer acceptance and actual payment authorization. Do not label unfunded tasks as escrowed or paid.
5. Confirm judge repository access, domain and social-account ownership, publication permissions, privacy redaction and rules/deadline with the owner.
6. Owner approves the final package and performs submission. Retain the actual submission acknowledgment/identifier privately, then report only the verified submission status.

No commit, push, deployment, migration, systemd change, secret provisioning, social publication or submission was performed by this documentation/backup implementation pass.
