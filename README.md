# ProofPay

**Agree on the checks. Pay for accepted work.**

ProofPay is a proposed AI-assisted acceptance and settlement product for small localization jobs. Buyers and workers agree on a source snapshot, requirements and deliverable allocations before work starts. Objective checks are reproducible; semantic AI review is advisory and evidence-linked. Accepted deliverables may eventually be settled independently of disputed work.

## What is actually implemented

This repository is a **team development foundation**, not a finished escrow marketplace.

- Next.js / React / TypeScript localization workbench.
- Same-origin Next.js API route forwarding bounded requests to Go.
- Go deterministic flat-JSON localization checker: key parity, nonblank output, placeholder preservation and selected exact required terms.
- Unit/HTTP tests, CI, safe environment examples and role-specific documentation.

**Not implemented:** accounts or wallet login, persistent tasks, agreement freezing/cryptographic commitments, AI provider integration, uploads, smart contracts, BOT transfers, disputes, deployment or competition submission. A successful check is NOT acceptance or payment authorization. No fake AI review or wallet transactions are shown.

## Quick start

Requirements: Node.js 24.x, npm, Go 1.27.1 or a compatible newer Go toolchain. Git is required to clone. No database, wallet or AI key is required for the implemented starter.

```bash
git clone https://github.com/zDarkx1/ProofPay.git
cd ProofPay
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

Open http://127.0.0.1:3000. Click **Run checks** with the supplied example, then use the corrected example and run again. Calls go through Next.js to Go at http://127.0.0.1:8080. See [local development](docs/DEVELOPMENT.md) for environment files and Windows instructions.

## Repository map

```text
frontend/       Next.js workbench and bounded backend-for-frontend route
backend/        Go HTTP API and deterministic checker
contracts/      Contract team handoff, decisions and acceptance tests (no deployed escrow)
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
```

## Contribution policy

Small feature branches and reviewed PRs. Add a failing regression test before behavior changes; keep API and docs synchronized. Do not put production data, seed phrases, API credentials or private keys in source, test fixtures, screenshots or issues. Read [CONTRIBUTING](CONTRIBUTING.md).

The repository starts private for team development. The owner must grant collaborators access and decide publication/license before submission. ProofPay is a working name; name collisions exist and no trademark clearance is claimed.
