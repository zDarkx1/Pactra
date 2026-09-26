# Pactra

**Agree on the checks. Pay for accepted work.**

Pactra is a proposed AI-assisted acceptance and settlement product for small localization jobs. Buyers and workers agree on a source snapshot, requirements and deliverable allocations before work starts. Objective checks are reproducible; semantic AI review is advisory and evidence-linked. Accepted deliverables may eventually be settled independently of disputed work.

## Product scope

Full details in [Product](docs/PRODUCT.md).

- **Problem hypothesis:** unclear or changing acceptance requirements can create buyer–worker disagreements; separate deliverable allocations may avoid holding unrelated work together. These are design hypotheses, not proven outcomes.
- **Proposed end-to-end flow (NOT fully implemented):** buyer drafts an acceptance manifest → both sides freeze the same source, rules, allocation and policy → buyer funds escrow only after security gates → worker submits versioned artifacts → deterministic checks find objective failures while AI suggests semantic concerns with evidence → buyer accepts deliverables or requests bounded revisions → accepted allocations become withdrawable; disputes follow the agreed policy.
- **Terms:** *Manifest* = frozen bundle of source, rules, allocations, policy. *Deliverable* = independently priced output. *Submission* = one exact content version. *Acceptance* = authorized business decision, never just a green checker result. *Settlement* = on-chain allocation of money, separate from off-chain AI advice.
- **Non-goals:** no autonomous AI payouts, no arbitrary code execution, no cross-chain bridge, no reputation tokens, no production fund custody in the starter.

## Architecture and boundaries

Full details in [Architecture](docs/ARCHITECTURE.md).

```text
Browser → Next.js BFF (POST /api/check) → Go (POST /api/v1/check) → deterministic response
```

- The browser never needs a Go host URL or a secret; Next is a thin transport/UI boundary, Go owns checker rules.
- **Ownership:** frontend (app, components, request state, same-origin proxy), backend (checker, limits, error contracts), contracts (future Solidity; AI may never be a payout authority).
- **Failure boundaries:** HTTP success is not chain confirmation; AI failure leaves deterministic/manual review available; client-side state is not acceptance authority.
- **Change discipline:** freeze API/checker versions before handing fixtures to teammates; contract addresses and ABI version together.

## Local development

Full details in [Development](docs/DEVELOPMENT.md).

Requirements: Node.js 24.x, npm, Go 1.27.1 (see `backend/go.mod`), Git. Contracts additionally need Foundry v1.8.3 (`git submodule update --init --recursive` after cloning). No database, wallet, cloud account or AI key is required for the starter.

```bash
git clone https://github.com/zDarkx1/Pactra.git
cd Pactra
npm ci
```

Terminal 1:

```bash
cd backend
go run ./cmd/server
```

Terminal 2 (repository root):

```bash
npm run dev
```

Open http://localhost:3000. **Open Pactra** leads to the wallet connection page; configure the wallet network and backend session service, then connect and sign in to enter the workspace. The public landing preview remains available without a wallet. Calls go through Next.js to Go at http://127.0.0.1:8080.

Environment defaults work without any env files; copy `frontend/.env.example` to override `GO_API_URL`. Smoke test: `GET http://127.0.0.1:8080/health`, then run the initial workbench example — invalid JSON must show a real validation error, never a successful empty report.

## Live deployment (BOT Chain)

The app runs at [https://pactra.my.id](https://pactra.my.id). Contract addresses are recorded per network in [contracts/deployments/](contracts/deployments/) and verified on the official explorers.

| Network | Chain ID | Escrow contract | Explorer | Status |
| --- | --- | --- | --- | --- |
| BOT Chain Testnet | 968 | [`0x65c928E9C8c102B3a95eE716AD0a32A5Bf6AE624`](https://scan.bohr.life/address/0x65c928E9C8c102B3a95eE716AD0a32A5Bf6AE624) | [scan.bohr.life](https://scan.bohr.life) | Deployed and verified; current app target |
| BOT Chain Mainnet | 677 | [`0x2f4863b44c971dF701db831ae736Fdc0485B74DD`](https://scan.botchain.ai/address/0x2f4863b44c971dF701db831ae736Fdc0485B74DD) | [scan.botchain.ai](https://scan.botchain.ai) | Deployed and verified; not enabled in the app yet |

- The live app currently targets **BOT Chain Testnet (968)** so every escrow flow — create, accept, fund, submit, review, dispute, settle, withdraw — can be exercised end to end without real funds. Mainnet switches only after all testnet flows pass.
- Contract runtime bytecode is identical on both chains (same commit); each deployment record stores the transaction hash, block, deployer, attestor and code hash.
- [Deployment records](contracts/deployments/) · [Network verification](docs/NETWORK_VERIFICATION.md) · [On-chain API](docs/ONCHAIN_API.md)

## Persistent backend update

Existing deployments: follow the [Pactra rename cutover](docs/RENAMING.md) before running the renamed backend.

Wallet login/session APIs and persistent private task invitations, manifest fingerprints, worker acceptance and pre-acceptance cancellation are now implemented. Read [persistent backend](docs/PERSISTENT_BACKEND.md), [frontend handoff](docs/FRONTEND_WORKSPACE_HANDOFF.md), [exact workspace API](backend/internal/workspace/README.md), [Supabase setup](docs/SUPABASE.md) and [operations](docs/BACKEND_OPERATIONS.md). Frontend wallet/task screens and their HttpOnly session BFF are implemented. Task creation requires real team-approved arbiter wallets in server configuration; empty configuration fails closed. Accepted tasks remain **unfunded**.

## Azure integration update

Optional real semantic review is now implemented separately from deterministic checks. Read [Azure AI setup and limits](docs/AZURE_AI.md). Default checkout has no credentials and AI stays disabled until configured. The workspace requires authentication and explicit durable daily request budgets for AI. The live app uses the deployed testnet escrow; see [Live deployment](#live-deployment-bot-chain).

## What is actually implemented

This repository is a **team development foundation**, not a finished escrow marketplace.

- Next.js / React / TypeScript localization workbench.
- Same-origin Next.js API route forwarding bounded requests to Go.
- Go deterministic flat-JSON localization checker: key parity, nonblank output, placeholder preservation and selected exact required terms.
- Unit/HTTP tests, CI, safe environment examples and role-specific documentation.

The non-contract workspace branch adds versioned private JSON submissions, persisted checker metadata, buyer review/revision, a dispute evidence flag, creation idempotency and pagination. See [current roadmap](docs/ROADMAP.md), [delivery API](docs/DELIVERY_API.md), [AI budgets](docs/AI_BUDGETS.md) and [deployment gates](docs/DEPLOYMENT.md). These source features are not a claim that every public API is enabled.

**Not implemented:** funded delivery enforcement beyond the testnet escrow flows, cross-chain bridges, autonomous AI payouts, or a completed competition submission. A successful check is NOT acceptance or payment authorization. No fake AI review or wallet transactions are shown.

## Repository map

```text
frontend/       Next.js workbench and bounded backend-for-frontend route
backend/        Go HTTP API and deterministic checker
contracts/      Pinned Foundry toolchain, escrow source, tests and deployment records (testnet + mainnet)
docs/           Product, architecture, frontend/backend and delivery guides
examples/       Safe example inputs; not real customer documents
scripts/        Documentation checks
.github/        CI and PR template
```

## Team reading order

1. [Product and scope](docs/PRODUCT.md)
2. [Local setup](docs/DEVELOPMENT.md)
3. [Architecture and ownership](docs/ARCHITECTURE.md)
4. [Frontend guide](docs/FRONTEND.md) or [Backend guide](docs/BACKEND.md)
5. [Current API](docs/API.md) and [checker specification](docs/CHECKER.md)
6. [AI review design](docs/AI_REVIEW.md), [contract handoff](contracts/README.md), [settlement decisions](docs/SETTLEMENT_DECISIONS.md)
7. [Security](docs/SECURITY.md), [testing](docs/TESTING.md), [roadmap](docs/ROADMAP.md)
8. [Deployment](docs/DEPLOYMENT.md), [hackathon checklist](docs/HACKATHON.md), [verification evidence](docs/VERIFICATION.md)

## Checks

```bash
npm test
npm run test:docs
npm run typecheck
npm run build
cd backend
go test -race ./...
go vet ./...
go build ./cmd/server
cd contracts
forge fmt --check
forge build --sizes
forge test
```

## Contribution policy

Small feature branches and reviewed PRs. Add a failing regression test before behavior changes; keep API and docs synchronized. Do not put production data, seed phrases, API credentials or private keys in source, test fixtures, screenshots or issues. Read [CONTRIBUTING](CONTRIBUTING.md).

The repository starts private for team development. The owner must grant collaborators access and decide publication/license before submission. Pactra is a working name; name collisions exist and no trademark clearance is claimed.
