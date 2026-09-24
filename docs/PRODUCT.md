# Product scope

## Research grounding
See [Research evidence](RESEARCH_EVIDENCE.md) for primary sources from NYC DCWP, W3C Internationalization and NIST, the precise claims they support, and limits on extrapolation. External sources motivate the design; they do not prove Pactra reduces disputes or certify its implementation.

## Problem hypothesis and initial audience
The team hypothesizes that unclear or changing acceptance requirements can create buyer–worker disagreements and that separate deliverable allocations may avoid holding unrelated work together. These are design hypotheses, not measured prevalence or proven outcomes. Start with flat JSON localization files, not arbitrary freelance work.

## Proposed end-to-end product (NOT implemented)
1. Buyer drafts an acceptance manifest; AI may suggest missing questions, never invent binding terms.
2. Buyer and designated worker accept the same frozen source, rules, deliverable allocation, deadlines and settlement policy.
3. Buyer funds escrow only after contract/security gates are met.
4. Worker runs the same checker available to buyer and submits a versioned artifact.
5. Deterministic checks identify objective failures; AI suggests semantic concerns with evidence.
6. Buyer accepts individual deliverables or requests a bounded revision against existing criteria.
7. Accepted allocations become withdrawable; disputed allocations follow the previously agreed policy.

## Implemented vertical slice
Paste source/submission JSON → Next BFF → Go checker → per-key findings. No task is created, no document is stored, no AI provider is called, and no payment is approved.

## Terms
- Manifest: proposed immutable bundle of source snapshot, rules, allocations and policy.
- Deliverable: independently priced output, initially one target-language bundle.
- Submission: one exact content version; a revision is a new version.
- Review: findings tied to exact manifest/submission/checker versions.
- Acceptance: authorized business decision, not a green checker result.
- Settlement: on-chain allocation of money, separate from off-chain AI advice.

## Differentiation and proof limits
The product hypothesis is symmetric, reproducible acceptance: worker sees the same criteria before work, and proposed new requirements are separated from defects. Milestones, escrow and AI review alone are not new inventions. Hashes prove correspondence, not work quality; wallet signatures do not establish legal identity. No guaranteed win or legal-enforceability claim.

## Non-goals
No autonomous AI payouts, universal fraud detection, arbitrary uploaded code execution, cross-chain bridge, marketplace reputation/token economics, image/audio review or production fund custody in the starter.
