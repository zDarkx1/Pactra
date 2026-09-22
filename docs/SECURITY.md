# Security and trust boundaries

The starter accepts bounded JSON and performs deterministic computation; it is not an audited financial application.

## Current protections
Loopback defaults, bounded JSON input, strict Go validation, same-origin BFF, no arbitrary URL fetch from submitted content, no AI key or signing key, escaped React rendering and no persistence. Validate implementation/tests rather than treating this document as an audit certificate.

## Before public hosting
Add request-rate and cost controls, HTTPS, trusted proxy policy, deployment resource limits and monitoring. Anonymous compute can still be abused even when stateless. Verify logs do not contain submitted text. No claim of production readiness based on successful build alone.

## Future threats
Wallet nonce/signature replay; insecure direct object access; mutable URLs; prompt injection; untrusted model output; exposed NEXT_PUBLIC secrets; oversized uploads; SSRF; duplicate transactions; bad allowance scope; malicious receivers; stale chain state/reorgs; compromised arbiters; hostage funds.

## Secrets
Local .env files are ignored. Only env example names belong in Git. Never reuse TKM credentials. No wallet secrets in browser bundles, chat, issue screenshots or CI logs. Native-wallet approval belongs to the human owner.

## Incident handling
Stop accepting new work if integrity is uncertain, preserve nonsensitive diagnostics, notify owner privately, rotate exposed credentials and follow approved recovery procedures. Do not delete financial evidence or promise to reverse confirmed blockchain actions.
