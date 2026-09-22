# Azure semantic review — implemented integration

## Current behavior
Optional POST /api/v1/review in Go, proxied by Next POST /api/review. Same request shape as deterministic /check. Explicit user consent in the UI before sending source/submission to Azure. Editing any input unmounts/aborts and clears the old review and consent.

Response: status=completed, advisory=true, findings[] with key, assessment (supported/concern/uncertain), exact full source_excerpt, exact full submission_excerpt and explanation. Go also returns provider/model metadata. Each shared key requires exactly one finding; unknown/duplicate/missing keys and invented excerpts cause an error. Evidence correspondence does not prove the AI's conclusion correct.

Limit16KiB,20keys per object, one in-flight request per Go handler and10-second cooldown after an attempt. Upstream timeout30seconds, max_output_tokens2500, response cap256KiB. Oversized/partial output is rejected, not silently truncated. Large valid requests may exhaust output budget and return unavailable; use smaller batches.

The integration sends store:false, uses no tools, never signs transactions and never authorizes payment. Redirects denied, endpoint restricted to HTTPS Azure services.ai.azure.com Responses path. There is no automatic retry or mock-success fallback.

## Configuration (Go process environment only)
PROOFPAY_AI_ENDPOINT=https://YOUR-RESOURCE.services.ai.azure.com/openai/v1/responses
PROOFPAY_AI_MODEL=gpt-6-astra
PROOFPAY_AI_KEY=<server-side secret>

All three must be set or all empty. Invalid partial config fails startup. The key is not bundled or committed. backend/.env.local is ignored and NOT automatically loaded by Go. Load through your process supervisor or shell; Next uses only GO_API_URL pointing to Go. Never use NEXT_PUBLIC_ for credentials.

Disabled review returns503 ai_not_configured. Busy429 ai_busy. Timeout504 ai_timeout. Provider refusal/malformed/unavailable502 ai_unavailable. Invalid input400; body too large413. The Next proxy returns sanitized errors. Deterministic /check remains independent and backwards-compatible; its historical ai_review field still says not_configured because that endpoint never runs AI. Use the separate semantic endpoint for AI.

## Verified integration
Azure Responses request returned HTTP200 with model gpt-6-astra. Actual Go→Azure→Next browser flow detected the change from “Payment is pending” to “Pembayaran berhasil”, returned matching evidence, and cleared results/consent after edit. Live Azure includes reasoning metadata and extra envelope fields; parser explicitly supports observed metadata while keeping result schema strict. Reasoning is not displayed.

## Security / limitations
This is LOCAL development. Do not expose publicly before authentication and per-user/durable spend limits. Process cooldown is neither a billing cap nor distributed rate limiting; restarts reset it. Provider calls may cost money. Aborting browser requests does not guarantee provider billing stops. No raw provider errors, prompts or keys in logs. User-shared key should be rotated because it was sent through chat. store:false is not a promise of zero provider retention; check Azure account policies.

Not implemented: AI criteria builder, amendment detection, dispute summary, wallet, storage, escrow. AI output is advisory and may hallucinate. No broad quality/safety benchmark or security audit has been completed.
