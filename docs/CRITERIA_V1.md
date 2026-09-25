# Structured acceptance criteria (criteria-v1)

Version: criteria-v1, pinned to checker `localization-v1`. Scope: JSON criteria expressing deterministic judging rules for a deliverable. Legacy free-prose criteria remain accepted as human-only (policy `default_metadata_only`); only valid `criteria-v1` JSON selects policy `criteria_v1_pinned`.

1. **Shape:** `{"criteria_version": "criteria-v1"|"draft", "checker_version": "localization-v1", "checks": [...]}`. `checks` holds 1..5 entries with unique ids from the allowlist below. `key_parity` and `nonempty` are required. Unknown fields, duplicate ids, NUL bytes and invalid UTF-8 are rejected.
2. **Fixed checks (not human-editable):** `key_parity` (every source key present, no extras), `nonempty` (every submitted string nonblank). Both take no `params`.
3. **Editable checks:** `placeholders` (`params.enabled` bool, placeholder grammar per CHECKER.md), `required_terms` (`params.terms`, 0..30 entries, each nonblank, at most 100 bytes, case-sensitive substring preservation), `human_review` (`params.prompt` 1..500 chars, `params.required` bool; advisory only, never triggers an automatic path).
4. **Limits:** whole criteria string at most 4000 characters; draft transport body at most 16 KiB. Term length is measured in UTF-8 bytes; prompt length in Unicode characters.
5. **Lifecycle:** AI output is always `draft` (never binding) with per-value provenance. Humans edit allowlisted values through typed controls; each edit bumps the draft revision with a visible diff. Buyer freezes to a manifest + `manifest_hash`; worker accepts the exact hash. Any post-freeze edit is a new manifest plus re-acceptance. No silent updates.
6. **Evidence:** judging output is evidence (`checks[]` deterministic, `findings[]` advisory with exact excerpts, `provenance[]` AI vs human), bound to `manifest_hash + criteria_version + checker_version + submission_version`. Checks passed is not acceptance; acceptance is not settlement. Financial authority stays with buyer/timeout/named human arbiter (primary 48h, backup 48h, handover revokes the primary; dual signatures if both miss). See `temps/09_ARBITER_EVIDENCE_SPEC.md`.

Example valid criteria: `examples/criteria-v1-valid.json`. Example invalid criteria with expected errors: `examples/criteria-v1-invalid.json`. Both fixtures are labeled synthetic demo data.
