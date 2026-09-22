# Frontend development guide

## Responsibility
Next.js App Router provides an English localization review workbench, not a fake marketplace. Read frontend/README.md and docs/API.md before editing.

## Current flow
Editable source JSON, submission JSON, placeholder toggle and required terms → Run checks → per-key findings. Initial examples are synthetic and labelled. Editing input must clear/invalidate prior results so an old pass is never shown for new content.

## Transport
The browser POSTs only to /api/check. The Next server forwards bounded JSON to the fixed Go endpoint using server-only GO_API_URL. Do not expose AI/provider credentials with NEXT_PUBLIC_. Do not accept a request-supplied proxy target. Preserve raw nested JSON when sending so duplicate keys reach Go validation instead of being silently discarded by JSON.parse/stringify.

## UX requirements
- Render pending, invalid input, upstream unavailable and successful checks distinctly.
- A failed criterion is a normal HTTP200 review result, not a transport exception.
- Say “checks passed”, never “payment approved” or “AI verified” in the starter.
- Render messages as text; no dangerouslySetInnerHTML from submissions or AI.
- Inputs have labels; status/error announcements use accessible roles; support narrow screens and keyboard navigation.
- Disable duplicate submissions while in flight and ignore/abort obsolete responses.

## Next slices
1. Evidence panels highlighting exact source and output excerpts.
2. Manifest draft editor with missing terms clearly marked and no invented defaults becoming commitments.
3. Backend-backed snapshots after auth/storage design.
4. Wallet login only after nonce/domain/chain/signature/replay design is agreed.
5. Pending/confirmed chain actions using reviewed ABI, never optimistic financial success.

## Tests and PR checklist
Run npm test, typecheck, build; browser-check malformed JSON, missing placeholder, corrected submission, backend outage and editing while request is pending. Include screenshots with synthetic data. Document contract changes before merging. No deploy side effects from a UI PR.
