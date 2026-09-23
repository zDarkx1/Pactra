# Pactra frontend

Next.js App Router workspace for private localization agreements and deterministic
JSON checks. The implemented task lifecycle ends at accepted_unfunded. No funds move.

## Pages

- /: public product introduction with a labelled synthetic evidence preview.
- /checker: standalone checker, per-key evidence, optional local-only AI review.
- /tasks: private task list, buyer/worker and status filters, latest-50 limit.
- /tasks/new: draft, review all terms, then create an invitation.
- /tasks/[id]: full manifest, exact server hash, role-based acceptance/cancellation.
- /dashboard: redirect to /tasks.

Wallet UI uses RainbowKit, wagmi, viem, and TanStack Query. Fonts are self-hosted
through Fontsource. Styling follows DESIGN.md; implementation scope lives in TASK.md.

## Run locally

From the repository root, use Node 24 and npm ci, then npm run dev.
Start Go separately with: cd backend && go run ./cmd/server.
Use http://localhost:3000 for wallet work, not an interchangeable 127.0.0.1 origin.
Next may bind 127.0.0.1 while its public SIWE origin remains localhost.

Copy frontend/.env.example to frontend/.env.local only when configuring your own
local environment. Next reads this file; Go still reads process environment.
Never copy database or Azure secrets into Next or public network metadata.

## Wallet and task configuration

Wallet setup remains visibly disabled until these PUBLIC network fields are valid:
PACTRA_CHAIN_ID, PACTRA_CHAIN_NAME, PACTRA_RPC_URL,
PACTRA_NATIVE_CURRENCY_NAME, PACTRA_NATIVE_CURRENCY_SYMBOL, and
PACTRA_NATIVE_CURRENCY_DECIMALS. PACTRA_EXPLORER_URL is optional.
Do not use credential-bearing RPC URLs: this metadata goes to the browser.

PACTRA_APP_ORIGIN must exactly match Go's SIWE domain/URI and the actual browser
origin. Use HTTPS in production. Production GO_API_URL must also use HTTPS.
Chain IDs must match Go. Do not assume these fields describe a verified BOT network.

PACTRA_WALLETCONNECT_PROJECT_ID enables WalletConnect when supplied. Without it,
only installed/injected wallets are offered. This is a project identifier, not a secret.
Only EOA authentication is supported by Go; smart-contract wallets are not supported.

PACTRA_ARBITERS is a comma-separated list of team-approved addresses matching Go's
allowlist. If it is empty or lacks two options, the create form stays blocked.
Native-currency display metadata does not establish an agreement settlement asset:
allocation amounts remain explicitly labelled raw base units.

## Boundaries

Browser calls /api/workspace/...; the fixed Go API owns authorization and transitions.
The Next BFF stores the Go bearer in an HttpOnly, SameSite=Strict cookie, Secure on
HTTPS. Browser JavaScript does not receive the bearer. Mutations require the exact
configured Origin. Protected requests also bind the current wallet address/chain.

Connect is not sign-in. Sign-in uses the exact Go SIWE message. Signing does not
accept a task. Task acceptance uses the exact returned manifest hash, not a browser
hash. Account/network changes hide private data immediately and attempt revocation.
Failed logout is reported, never represented as confirmed server revocation.

Create is not retried automatically after an uncertain response. Accept/cancel use
readback on conflict/timeout. No frontend action may mark a task funded or paid.
Standalone checker results are not persisted task submissions.

AI review is blocked by the Next route in production, not just hidden in the UI.
Do not expose Go's local AI endpoint publicly before authenticated durable budgets.
No AI/provider request or funded transaction is part of frontend verification.

Indexing defaults off. Set PACTRA_PUBLIC_INDEXING=true only after public release
approval and a valid canonical origin. Sitemap includes only / and /checker;
private routes use noindex and API responses use no-store. Robots is not authorization.

## Checks and remaining gates

Run npm test, npm run typecheck, npm run build, and npm run test:docs from the root.
The build externalizes the optional Base Account server SDK to avoid bundling its
unused optional payment peers. No Base Account payment integration is implemented.

See ../docs/FRONTEND_PASS_VERIFICATION.md for actual test evidence, dependency audit
findings, browser limitations, and the remaining real-wallet/configuration gates.
A successful build is not production or financial approval.
