# Pactra frontend

Next.js App Router / React / TypeScript. Install from the repository root with `npm ci`, then `npm run dev`. Start Go separately using `cd backend && go run ./cmd/server`.

Optional config: copy .env.example to .env.local. GO_API_URL is server-only; default http://127.0.0.1:8080. No secret or database is required for this starter.

Run tests/typecheck/build from the root. Production local preview: `npm run build`, then `npm run start --workspace=frontend`. Standard Next server output is used, not a static export.

The UI calls /api/check; its Next route calls Go /api/v1/check. Inputs are never persisted. AI, wallet and settlement milestones are explicitly not implemented.

Read [frontend development](../docs/FRONTEND.md), [API](../docs/API.md), [testing](../docs/TESTING.md) and [local setup](../docs/DEVELOPMENT.md).
