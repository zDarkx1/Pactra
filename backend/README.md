# Pactra backend

A standard-library-only Go 1.27.1 stateless localization JSON acceptance checker. No escrow, payments, blockchain, cryptographic proof, hash endpoint, database, authentication, AI, or outbound network calls. Deterministic syntactic checks are not semantic or translation-quality verification. Human review is required.

## Local use

From this directory, with Go 1.27.1 on PATH:

```sh
go run ./cmd/server
go test -race ./...
go vet ./...
go build -o bin/pactra ./cmd/server
# Optional real-process smoke test (Python 3 standard library):
python3 scripts/smoke.py
```

Installed toolchain in this workspace: `/root/.local/toolchains/go1.27.1/go/bin/go`.

Only HOST and PORT are read. Defaults: HOST=127.0.0.1, PORT=8080. HOST must be a numeric IPv4 or IPv6 address (no DNS); PORT must contain decimal digits and be in 1–65535. Empty values use defaults. `.env.example` is illustrative; the process does not load dotenv files. For example:

```sh
HOST=127.0.0.1 PORT=8080 go run ./cmd/server
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:8080/ready
curl -s http://127.0.0.1:8080/api/v1/check \
  -H 'Content-Type: application/json' \
  --data '{"source":{"greeting":"Hello {name}, use Pactra"},"submission":{"greeting":"Bonjour {name}, utilisez Pactra"},"rules":{"preserve_placeholders":true,"required_terms":["Pactra"]}}'
```

The server binds before serving; configuration and bind failures exit nonzero. SIGTERM/SIGINT trigger graceful shutdown with a 10-second deadline. HTTP timeouts: headers 5s, read 10s, write 15s, idle 60s; max headers 16 KiB. No request/body logging or CORS middleware. Intended for a same-origin Next.js BFF, not as a hardened public deployment.

## Checker contract

- GET `/health`: `{"status":"ok"}`.
- GET `/ready`: `{"status":"ready","mode":"stateless-checker"}`; readiness has no dependency probes.
- POST `/api/v1/check`: requires `application/json` (media-type parameters accepted), and exactly `source`, `submission`, `rules`.
- Source/submission: flat, nonempty JSON objects, each at most 200 keys. Keys at most 200 UTF-8 bytes; string values at most 4000 UTF-8 bytes. Empty keys are allowed; empty source values are allowed. Blank submission values are valid input but fail acceptance.
- Rules requires exactly `preserve_placeholders` (boolean, including explicit false) and `required_terms` (array, possibly empty). At most 30 terms; each nonblank and at most 100 UTF-8 bytes. Terms are used literally, not trimmed, case-folded, or normalized.
- Missing/null fields, non-string values, unknown fields (case-sensitive), duplicate object keys at every depth (including escaped-equivalent names), malformed JSON, trailing JSON/junk and invalid UTF-8 are rejected. Maximum body is 128 KiB inclusive, including trailing whitespace. Excessively nested malformed objects are rejected.
- Key parity is always checked. Every missing or extra key fails. Every present submission string is checked for Unicode whitespace-only/empty content.
- When enabled, placeholders matching `\{[A-Za-z_][A-Za-z0-9_]*\}` are compared as multisets separately for each matching key. Missing, extra, or repeated placeholder differences fail; ordering does not matter. Nonmatching brace syntax is not a placeholder.
- For each required term that occurs as an exact case-sensitive substring in a source value, the corresponding submission must contain the same substring. Missing submission fails. Terms absent from the source value produce no term check.

A valid request always returns HTTP 200, including failed acceptance:

```json
{"checker_version":"localization-v1","passed":true,"checks":[{"id":"key_parity","key":"greeting","status":"pass","message":"Key exists in source and submission."},{"id":"nonempty","key":"greeting","status":"pass","message":"Submission is nonblank."},{"id":"placeholders","key":"greeting","status":"pass","message":"Placeholder multisets match."},{"id":"required_term","key":"greeting","status":"pass","message":"Required term preserved: Pactra"}],"ai_review":{"status":"not_configured","message":"Semantic review is not implemented. Human review required."}}
```

Checks use the sorted union of keys (Go lexicographic string order). Within each key, fixed order is `key_parity`, `nonempty` if submission exists, `placeholders` if enabled and both values exist, then `required_term` for applicable terms in request-array order. Repeated terms produce repeated checks. Term messages identify the literal term. `passed` is true only if every emitted check passes. No timestamps or random identifiers.

Errors use `{"error":{"code":"invalid_request","message":"Invalid checker request."}}` with generic messages that never echo the body. Codes/statuses: `invalid_request`/400, `request_too_large`/413, `unsupported_media_type`/415, `method_not_allowed`/405 (with Allow), `not_found`/404. Exact paths only, no redirects. HEAD/OPTIONS are not supported. Routing/method checks precede content type, which precedes body validation. All application responses have `Content-Type: application/json` and `X-Content-Type-Options: nosniff`; no CORS headers. Transport-level HTTP parser failures remain handled by Go's HTTP server.

Public integration entry point: `backend.NewHandler() http.Handler` in module `pactra/backend`. Safe to share between concurrent requests.

Monorepo documentation: [backend architecture](../docs/BACKEND.md). That document is maintained outside this backend-only scope.
