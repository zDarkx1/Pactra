# Settlement policy — blocking decisions

No funds should be accepted until these decisions have an owner-approved answer and contract tests. This file is NOT a deployed policy.

- Who may create/accept a task? Is worker designated or open-claim? How are self-claims treated?
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
