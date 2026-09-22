# Roadmap and ownership

## P0 — runnable team foundation (this handoff)
Go checker, Next workbench, tests, env, docs and CI. Verify locally and inspect VERIFICATION.md.

## P1 — acceptance evidence
Backend: canonical manifest draft/version specification and test vectors.
Frontend: per-criterion source/output evidence and editable draft with missing fields.
Both: validate narrow localization use case with actual users; freeze checker grammar/version.
Done: unchanged snapshots reproduce a report; changed input cannot reuse old review identity.

## P2 — identity and persistence
Owner chooses storage/auth design. Implement wallet session security, authorized snapshots and versioned submissions. Document migrations and backups. Do not confuse database task state with blockchain state.

## P3 — real AI advisory
Choose provider and budget; implement Go adapter, strict schema/evidence checks, timeout and unavailable fallback. Evaluate hallucination/prompt-injection cases. No model-authorized payments.

## P4 — settlement policy and contracts
Resolve every blocking decision, then implement/tests/review. Integrate ABI and event readback only after testnet behavior is proven. No funds before gate.

## P5 — public end-to-end and submission
Real testnet then explicitly approved mainnet deployment, funded minimal tests, stable public frontend/backend, docs, X requirements, branding and deadline confirmation. All seven submission items tracked in HACKATHON.md.

Team size/individual owners are not yet assigned; assign a person to each workstream during kickoff. Do not assume there are three engineers available. A roadmap is not a commitment that all items fit the remaining contest time.
