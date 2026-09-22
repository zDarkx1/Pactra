# Local development

## Prerequisites
Node24.x, npm and Go1.27.1 (see backend/go.mod). Verify `node --version`, `npm --version`, `go version`. Install dependencies using `npm ci` from the repository root; the root package-lock.json is authoritative. Do not create a second frontend lockfile.

## Environment
Defaults work without any env files.
- Next: copy frontend/.env.example to frontend/.env.local to override GO_API_URL.
- Go: reads process environment, not dotenv files. backend/.env.example documents HOST and PORT only.
- Default browser URL: http://127.0.0.1:3000; backend: http://127.0.0.1:8080.

Linux/macOS backend override:
```bash
cd backend
HOST=127.0.0.1 PORT=8080 go run ./cmd/server
```
PowerShell:
```powershell
cd backend
$env:HOST='127.0.0.1'
$env:PORT='8080'
go run ./cmd/server
```
Second terminal, repository root:
```bash
npm run dev
```
No Docker, Supabase, wallet, cloud account or model key is required. Do not invent DATABASE_URL or NEXT_PUBLIC_AI_KEY variables; they are not used by this starter.

## Smoke test
GET http://127.0.0.1:8080/health and /ready. Open the workbench, run the initial example, correct the missing placeholder and rerun. Invalid JSON should show a real validation error, not a successful empty report.

## Troubleshooting
- Connection refused / upstream unavailable: start Go; check port and GO_API_URL; restart Next after env changes.
- Address already in use: stop only your own dev process or choose another port and update GO_API_URL.
- JSON rejected: only flat objects with string values are supported; no arrays, nested objects or duplicate keys.
- No AI result: expected. Semantic review is explicitly unimplemented.
- No tasks after refresh: expected. Nothing is persisted.
- On Windows use PowerShell env syntax; `export` is for Unix shells.

Use separate terminals; Ctrl+C stops each service. Never commit .env.local.
