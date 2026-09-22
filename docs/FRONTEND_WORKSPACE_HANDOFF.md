# Backend integration checklist for frontend team

The existing checker screen does not automatically expose the new workspace endpoints. Build frontend flows against Go; do not implement financial transitions in the browser.

## Wallet login
1. Ask the wallet for its EOA address and selected chain. Switching address/network clears the old frontend session.
2. POST /api/v1/auth/challenge with address. Display/let wallet sign the **exact** message returned; never reconstruct it with changed whitespace or timestamps.
3. Sign using the wallet's personal_sign/EIP-191 flow, then POST /api/v1/auth/verify with challenge_id and signature.
4. Treat the bearer session as a secret. For the future production frontend, prefer an HttpOnly same-site BFF session; do not persist bearer tokens in localStorage. That BFF is not implemented in this increment.
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

## Suggested pages (not implemented here)
/tasks list; /tasks/new creation; /tasks/[id] agreement and acceptance; /dashboard buyer/worker views. Keep source/artifacts private. Frontend display should distinguish checker results, semantic AI advice, human acceptance and actual on-chain settlement.

## API source of truth
Read the workspace package README and PERSISTENT_BACKEND.md for implemented request/response definitions and operational limits. Existing docs about later submissions/disputes remain product design, not shipped endpoints.
