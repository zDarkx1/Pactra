# Frontend development guide

## Responsibility

Next App Router provides an English localization review workbench and a private,
unfunded agreement workspace. It is not a marketplace or an escrow implementation.
Read frontend/README.md, frontend/DESIGN.md, frontend/TASK.md, API.md, and the workspace
API contract in backend/internal/workspace/README.md before editing.

## Implemented routes

Landing at /; checker at /checker; wallet-authenticated /tasks, /tasks/new, and
/tasks/[id]. /dashboard redirects to /tasks. Public source/artifact discovery does
not exist. There is no separate funded-work submission, dispute, or payment screen.

## Transport and identity

Browser requests stay same-origin. /api/check and /api/review use fixed Go targets.
/api/workspace/... implements the auth/task BFF with bounded requests, response
projection, no-store, and generic errors. Go remains authoritative for task state.
Preserve raw nested JSON so duplicate keys reach Go validation instead of disappearing.

RainbowKit handles wallet connection; a separate EIP-191 signature signs the exact
Go SIWE message. Bearers stay in HttpOnly cookies, never localStorage or client JSON.
Mutations validate the configured browser Origin, not Next's reconstructed internal
hostname. App origin, Go SIWE domain/URI, and chain must match. Account/chain changes
invalidate the visible session and private cache. Logout attempts server revocation;
an outage must not be reported as successful revocation.

## UI and motion

Use the warm cream/coral system in frontend/DESIGN.md, not the prior dark-lavender brief.
Feedback has explicit timing, reduced-motion, keyboard, interruption, and cleanup
rules. Shared/task/checker CSS modules keep responsibility local. Do not install an
animation library for simple feedback or override private RainbowKit modal internals.

Inputs have labels. Focus is immediate. Error/status announcements are accessible.
A failed criterion is a normal HTTP200 report, not a transport error. Say “Checks
passed”, never “Payment approved”. User text renders escaped, never as raw HTML.
Editing clears results and AI consent immediately; late responses cannot restore them.

Task terms are immutable. Accept uses the server hash; create is never automatically
retried. Accept/cancel errors reconcile by readback. Counts cover at most 50 returned
tasks, not all history. Amounts are exact strings/raw base units, not assumed BOT/USD.

## Release gates

Wallet/network and official arbiter config must be supplied before real task testing.
AI remains local-only: the Next production route deliberately rejects review requests
until authenticated durable spend limits exist. A UI sign-in does not fix Go AI access.

Before public deployment, resolve dependency audit findings and perform real-wallet,
browser, accessibility, and motion QA. No deploy side effects from a frontend PR.
See FRONTEND_PASS_VERIFICATION.md for what was actually run and what remains unverified.
