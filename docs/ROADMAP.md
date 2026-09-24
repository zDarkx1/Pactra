# Current roadmap — non-contract workspace

The `feature/non-contract-workspace` branch extends the UI branch, not `main`.

## Implemented in source; integrated verification required before release
- Private wallet-authenticated agreement list/create/accept/cancel with immutable `accepted_unfunded` status.
- Buyer-scoped creation idempotency and participant-only cursor pagination.
- Voluntary unfunded JSON work review: versioned artifacts, actual checker metadata, revision requests, human acceptance and a dispute evidence flag. No delivery obligation before funding, monetary claim, financial timer, automated arbitration or payout.
- Authenticated AI advisory with explicit disabled-by-default daily wallet/global request caps. Failed attempts consume quota; request limits are not currency-budget guarantees.
- Bounded expired-auth cleanup and encrypted isolated backup/restore tooling.
- Editorial public landing, journal citations, accessible mega menu/sidebar, lazy loading and reduced-motion support.

See [delivery API](DELIVERY_API.md), [task reliability](TASK_RELIABILITY.md), [AI budgets](AI_BUDGETS.md), [operations proof](OPERATIONS_VERIFICATION.md), and [submission checklist](../SUBMISSION_READINESS.md).

## Remaining release gates
- Exact current migration/runtime grants, encrypted pre-migration backup, fresh integrated test and review verdict.
- Public wallet sign-in requires validated network settings. Public agreement creation also requires two real consenting team arbiter addresses; test fixture addresses must never replace them.
- Real browser-extension/device wallet QA is separate from a browser-injected test wallet using real cryptographic signatures.
- Public AI availability remains a separately explicit configuration with provider limits. No open unauthenticated provider endpoint.
- Hosted backup scheduling/restore and credential rotation must preserve team access and use the current schema; a local drill alone is not hosted disaster recovery.
- Contract-backed funding/settlement, arbitration policy/resolution and actual competition submission remain separate. X posting, repository visibility changes and launch claims need owner sign-off.

A built feature, verified local flow, pushed branch and public deployment are separate milestones. Final evidence belongs in NON_CONTRACT_VERIFICATION.md when available.
