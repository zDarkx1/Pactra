# AI review design — NOT IMPLEMENTED

The current response explicitly returns ai_review.status=not_configured. There is no provider secret, network inference, mock score or fake success.

## Intended purpose
Draft proposed acceptance questions, identify semantic differences and summarize why an existing criterion may need human review. AI does not invent binding criteria, accept work, sign transactions or determine payouts.

## Suggested future per-criterion schema
criterion_id, assessment (supported/concern/uncertain), source_excerpt, submission_excerpt, explanation, manifest_version, submission_version and provider/model metadata. This is a design sketch, not a current API.

Validate quoted evidence against the exact stored snapshots. A quotation matching the source still does not prove the model's conclusion. Objective checks stay in Go. Required glossary/placeholder failures are not delegated to a model.

## Safety
Treat submissions as untrusted data; embedded instructions cannot override the rubric or trigger tools. No signing key or payout tool in the review process. Bound text size, requests and model spend. Explain provider data handling to users and minimize personal information. API keys remain server-only.

## Failures
Timeout/unavailable/invalid schema -> explicit unavailable state. Preserve deterministic results and manual review. Never substitute a fabricated review. Any demo mock must be separate, conspicuously labelled and never used as financial authority.

## Evaluation before rollout
Use consented synthetic cases: correct translation, changed meaning, missing phrase, ambiguous source, adversarial prompt injection and provider failure. Record unsupported claims, invented criteria and evidence errors. Team chooses a provider/budget before implementation; no paid service is activated by this starter.
