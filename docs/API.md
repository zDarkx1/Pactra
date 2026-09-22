# Current HTTP API — starter v1

This page documents the original checker endpoints. Additional implemented APIs: [Azure semantic review](AZURE_AI.md) and [wallet/task workspace contract](../backend/internal/workspace/README.md). See [persistent backend setup](PERSISTENT_BACKEND.md). Other settlement/product APIs remain proposals.

## GET /health
Response200: {"status":"ok"}.

## GET /ready
Without workspace config: response200 {"status":"ready","mode":"stateless-checker"}. With DATABASE_URL/auth config, readiness pings PostgreSQL and returns mode=persistent-workspace; failed DB probe returns503. AI is not probed.

## POST /api/v1/check (Go)
Browser uses POST /api/check (Next proxy) with the same body/response.
Content-Type: application/json. Maximum body128KiB.

```json
{
  "source": {"greeting":"Hello {name}","brand":"ProofPay"},
  "submission": {"greeting":"Halo {name}","brand":"ProofPay"},
  "rules": {"preserve_placeholders":true,"required_terms":["ProofPay"]}
}
```

source and submission: nonempty flat JSON objects, at most200keys each, string values only. Key length≤200bytes; value length≤4000bytes. Empty/whitespace submitted values are accepted structurally but produce failed checks. rules is required; preserve_placeholders must be explicit. Required terms≤30, each nonblank and≤100bytes. Duplicate JSON keys, unknown fields and trailing JSON are rejected.

Response shape:
```json
{
  "checker_version":"localization-v1",
  "passed":true,
  "checks":[{"id":"example-check-id","key":"greeting","status":"pass","message":"Illustrative message; do not parse this text."}],
  "ai_review":{"status":"not_configured","message":"Semantic review is not implemented. Human review required."}
}
```
The check entry above illustrates the schema, not an exact exhaustive response. See backend tests for exact IDs. Clients branch on structured status, not message prose. passed means every implemented deterministic check passed; it does not mean accurate translation or buyer acceptance.

Errors: {"error":{"code":"machine_code","message":"Human readable explanation"}}.
400 invalid input;413 size exceeded;415 unsupported media type;405 wrong method. Proxy failures return a non-2xx upstream-unavailable/timeout error, not a fake report. See actual route code for error-code strings; changing them is an API change.

## Future APIs (not implemented)
Manifest drafts, task acceptance/funding references, versioned submissions, semantic reviews, buyer decisions, revision requests and chain reconciliation. Define schemas and auth before adding endpoints. No placeholder routes that return invented success.
