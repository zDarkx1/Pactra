# Backend integration checklist for frontend team

Frontend update (2026-09-23): the wallet/task UI and HttpOnly Next BFF are now implemented. Real-wallet and browser verification remain separate gates; see FRONTEND_PASS_VERIFICATION.md. Go still owns all transitions; the browser cannot implement financial state.

## Wallet login
1. Ask the wallet for its EOA address and selected chain. Switching address/network clears the old frontend session.
2. POST /api/v1/auth/challenge with address. Display/let wallet sign the **exact** message returned; never reconstruct it with changed whitespace or timestamps.
3. Sign using the wallet's personal_sign/EIP-191 flow, then POST /api/v1/auth/verify with challenge_id and signature.
4. Treat the bearer session as a secret. The frontend BFF now uses an HttpOnly same-site cookie, Secure on HTTPS. Do not persist bearer tokens in localStorage or expose them in client JSON. Configure the exact application origin for cookie/CSRF checks.
5. Use the bearer token on protected Go calls. Logout revokes that session server-side. Don't print tokens in console/telemetry or attach them to arbitrary URLs.

## Task creation and acceptance
- Show all acceptance criteria, source version, worker, arbiters, deadline, allocations and per-deliverable review/revision bounds before submission.
- Arbiter options come from the team, not arbitrary contact input. Backend enforces its configured allowlist.
- Only task participants can see task details. A404 may mean missing OR not visible; do not leak existence to outsiders.
- Worker sees the immutable manifest and submits its exact manifest_hash on acceptance. Never auto-accept a scope merely because a checker passed.
- An accepted task is still UNFUNDED. Do not render success as “payment secured”. There is no funding endpoint, escrow address or wallet transaction integration yet.
- Invitation expiry is enforced by Go without needing a cron transition. UI countdown is informative, not authoritative.
- For ambiguous timeout on accept/cancel, GET the task and reconcile the actual state. Do not fabricate success or reset status locally.
- Creation currently needs client caution around retry after uncertain network errors; idempotency keys are a follow-up before broad public use.

## Frontend pages (implemented; real-wallet QA pending)
/tasks list with buyer/worker filters; /tasks/new creation; /tasks/[id] agreement and acceptance; /dashboard redirects to /tasks. The standalone checker is at /checker. Keep source/artifacts private. Checker results, AI advice, human acceptance, and on-chain settlement remain distinct. No funding UI or saved submission flow exists.

## API source of truth
Read the workspace package README and PERSISTENT_BACKEND.md for implemented request/response definitions and operational limits. Existing docs about later submissions/disputes remain product design, not shipped endpoints.
