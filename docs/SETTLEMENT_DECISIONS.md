# Settlement policy — blocking decisions

No funds should be accepted until these decisions have an owner-approved answer and contract tests. This file is NOT a deployed policy.

## Implementation status update

The Go workspace now implements designated-worker invitations and immutable manifest acceptance, storing agreed per-deliverable amounts/revision limits/review windows. It ends at `accepted_unfunded`; no funding, revision execution, payout, dispute or timeout-claim behavior is implemented. The historical approval bullets below describe policy and may say 'not implemented' for the financial workflow even where agreement recording now exists. Technical defaults are documented in PERSISTENT_BACKEND.md.

## Agreed product decisions

- **Worker assignment:** Buyer invites one designated worker by wallet address. The invited worker reviews the scope and accepts before funding. Public open-claim tasks are outside the MVP. Approved by the owner in chat; not yet implemented.
- **Payment allocation:** Each deliverable has its own agreed allocation. An accepted deliverable can be paid independently while other deliverables remain under revision. Approved by the owner in chat; not yet implemented.
- **Funding:** After worker acceptance, the buyer funds the entire task upfront. Release remains per accepted deliverable. Approved by the owner in chat; not yet implemented.
- **Revisions:** Each deliverable has a revision limit agreed before funding. Requests outside the accepted scope require a separately agreed amendment and are not free revisions. Approved by the owner in chat; not yet implemented. Revision deadlines and the procedure for exhausting the limit remain unresolved.
- **Buyer silence / review timeout:** Each deliverable has a review period agreed before funding. It begins only after submission is recorded and the artifact is accessible to the buyer, not merely after posting a hash. Before expiry the buyer may accept, request an allowed revision, or dispute. An active dispute blocks timeout payout for that allocation. Without a response by the deadline, the worker may submit a claim transaction; the contract does not execute itself. Silence is not proof of quality. Approved by the owner in chat; not yet implemented. Artifact-access evidence and timer behavior after revision require explicit design.
- **Dispute arbiter:** A real human selected by the ProofPay team, not an AI agent. The designated arbiter must be disclosed to and accepted by both buyer and worker before funding. Authority is limited to allocating the disputed deliverable's funds between the parties, with no payment to the arbiter or access to unrelated allocations. Owner confirmed a team-selected human arbiter; implementation pending. Decision deadline, inactivity fallback, conflicts of interest, replacement and any future fee policy remain unresolved.
- **Backup arbiter:** A primary and backup human arbiter are designated and accepted before funding. If the primary misses the agreed decision deadline, the dispute may transition to the backup; this must revoke the primary's decision authority for that dispute. Owner approved the primary-plus-backup model; not implemented. Owner approved a 48-hour decision window for the primary starting when the dispute is opened, followed by a 48-hour window for the backup starting upon recorded handover. Transition caller, backup inactivity fallback and conflicts of interest remain unresolved. The timestamp anchors must be explicit in implementation; neither timer causes a transaction to run automatically.
- **Still unresolved:** self-invitations, invitation expiry/cancellation, reassignment, and dependency-linked deliverable rules.

## Remaining decisions

- Who may create a task, and how is each participant authenticated?
- What exact manifest/source/allocation version do both parties accept before funding?
- What is the delivery deadline, and when does each buyer inspection window begin?
- What proves that the submitted artifact is available to the buyer? A bare hash is insufficient.
- How many revision rounds are allowed? Can either party extend time, and whose consent is required?
- Can accepted deliverables settle independently, and what happens to dependency-linked deliverables?
- Does silence release funds? Under what submission conditions? Silence does not prove quality.
- Who resolves disputes? What authority, evidence, deadline and conflict-of-interest rules apply?
- What happens when the arbiter is absent? Indefinite locks, buyer-only refunds and automatic half-splits are not inherently fair.
- What happens on cancellation, no worker, no submission, chain reorg or failed withdrawal?
- Who may call timeout transitions and pay gas? Contracts do not wake themselves on a schedule.
- What are fees, recipient, rounding and residual-balance rules?

## Suggested starting constraints, not approved policy
Native BOT only, one chain, designated buyer/worker, bounded deliverables, immutable allocations, pull-based withdrawals and no admin arbitrary drain. A named arbiter is a trust assumption, not trustless adjudication. All exits need explicit terminal states and value-conservation tests.

## Release gate
Signed-off policy + reviewed Solidity + unit/fuzz/invariant tests + real two-wallet testnet flow + explicit user approval for mainnet. Green deterministic checks cannot authorize release by themselves.
