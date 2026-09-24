# Submission readiness — development, not a qualifying claim

Checkpoint: 2026-09-24 UTC. This is an English checklist and demo script, not a submission, launch announcement, eligibility certification, or authorization to post.

## Public versus development

Owner-provided public baseline: release `8a4fc38` at https://pactra.alrizky.me, on current Hermes `74.249.35.159`, not TKM. This pass performed only a stateless GET of the public homepage (HTTP 200). It did not independently attest the running release, exercise public wallet/write routes, inspect server secrets, or access a hosted database.

`feature/non-contract-workspace` is work in progress in a shared tree. Local operations verification is recorded in [OPERATIONS_VERIFICATION](docs/OPERATIONS_VERIFICATION.md). Local fixtures are explicitly synthetic storage tests, not actual customers, configured team arbiters, completed jobs, AI review evidence, funding, or chain activity. The accepted agreement remains immutable `accepted_unfunded`; no operations command grants payment or settlement authority.

## Official guidebook recheck

Fetched successfully on 2026-09-24 UTC:
https://www.girlmeetstech.org/guidebook-build-week-hackathon-vol2

The live text still lists these seven items. None is marked complete merely because an HTTP request or local storage test passed.

| Required item | Evidence needed / current limitation |
| --- | --- |
| BOT Chain contract address and real activity | Actual deployed contract, verified explorer records, and real interaction; not established here. Do not invent addresses, balances, receipts, or activity. |
| Live website on a domain with wallet/main action | Public homepage responds; public wallet/main-action behavior is not verified. |
| GitHub Solidity source and plain-English README, with testnet/mainnet deployment addresses | Actual `.sol` source and real addresses are required. Judge access needs owner approval; no repository visibility edits were made. |
| Dedicated project X account/post tagging `@BOTChain_ai` | Owner must supply a real account and valid post URL. No posting performed. |
| At least five valid posts within thirty days before submission | Supply real dated links from that account; do not fabricate or backdate activity. |
| Official BOT Chain Mainnet launch write-up | Blocked until a real authorized mainnet launch; do not publish a false launch claim. |
| BOT Chain branding with `botchain.ai` and explorer links | Verify actual public rendering and links before submission; not certified by this pass. |

The guidebook permits teams of one to three, AI tools, and original ideas. Its timeline literally says “Thursday, September 25, 2026 — 11:59 PM”; the numeric date is Friday. Prior project notes record GMT+7. Confirm the date, timezone, and conflicting weekday labels with organizers rather than treating this document as a deadline ruling. If 23:59 GMT+7 on the numeric date is intended, that is 2026-09-25 16:59 UTC (calendar conversion checked locally).

The guidebook describes GitHub Pages hosting, while this Next.js application uses server routes. Ask organizers to confirm alternate hosting/subdomain acceptance. Do not claim an unchanged static Pages deployment works. The published rubric lists contract/main action/clarity/X evidence; it is not a predicted score for Pactra.

## Owner sign-off checklist

- [ ] Confirm schedule, registration, team eligibility, naming, and hosting acceptance with organizers.
- [ ] Supply real team arbiter identities and consent; never substitute test addresses as production arbiters.
- [ ] Complete contract policy, implementation, security review, and separately authorized deployment/funding gates.
- [ ] Verify actual public wallet/main action on the approved release, with no fake users or transactions.
- [ ] Review privacy, authentication, quotas, retention, migration compatibility, deployment rollback, and operations evidence.
- [ ] Capture truthful screenshots/video with sensitive messages, keys, sessions, and private agreements excluded.
- [ ] Provide the real deployment/repository/explorer/post links required above; request owner approval before publishing or changing access.
- [ ] Submit only after explicit owner approval. Missing evidence stays missing; do not assert qualification.

## English demo script (prepared; not a claimed executed public demo)

1. Open https://pactra.alrizky.me without a wallet connection. Say: “This is the current public UI baseline. The separate non-contract workspace branch is still in development.” Do not show fabricated counters or customer activity.
2. Explain the problem: “Pactra records agreed task terms before delivery review and eventual settlement. Recording acceptance is not a payment.”
3. For a local workspace demonstration, first confirm the branch builds and is configured for an isolated local database. Use only consenting participants with wallets they actually control and real approved arbiter configuration. If that configuration is unavailable, stop the wallet portion and show the architecture and local test results instead; never invent identities.
4. When an authorized local workflow is actually available, show the immutable manifest and its identity, the designated-worker acceptance control, and participant access boundaries. Say: “Accepted means `accepted_unfunded`. No funds are deposited or released by this workspace.” Do not represent synthetic database fixtures as an end-user workflow.
5. Show a checker result only after running the checker against disclosed input. Show AI output only if a real request succeeded; otherwise show the unavailable state. Never fabricate advisory evidence or imply that an AI result authorizes funds.
6. Show the local operations test command and its actual result: `python3 -B scripts/test_pactra_ops.py`. Explain that it creates its own synthetic source/restore databases, encrypts and restores a real dump, checks rows/constraints, and tests retention. It neither accesses hosted data nor proves contract readiness.
7. Close: “The next gates are reviewed contracts, real deployment and chain interaction, approved public workspace release, and the organizer's complete submission evidence. This demo does not claim those gates have passed.”

No X posts, visibility changes, commits, pushes, deployments, or hosted-database operations were performed by this operations workstream.
