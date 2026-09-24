# Non-contract rollout boundaries

User authorized remaining non-contract implementation. No smart contract, funds, token approval, X publication, repository visibility change, invented arbiter or main merge is part of this change.

## Checkpoint
- Base public release: `8a4fc38`.
- Development: `feature/non-contract-workspace`.
- Hosted read-only preflight: role `pactra_runtime`, PostgreSQL17.6, zero tasks, zero sessions, schema CREATE=false.
- Encrypted pre-migration hosted `pactra` schema dump generated with official PostgreSQL17 client into private server storage. Authenticated encryption roundtrip verified.
- That dump restored to isolated local PostgreSQL16: five tables, zero tasks, immutable task trigger verified. The known PostgreSQL17 `SET transaction_timeout=0` statement was omitted for PostgreSQL16 compatibility; owner/ACL restoration was intentionally excluded. This proves pre-migration archive readability/schema restore, not full live disaster recovery.
- Full new migration0001–0004 encrypted local fixture restore is separately covered by OPERATIONS_VERIFICATION.md.

## Inputs not fabricated
- Two consenting real team arbiter public wallet addresses remain missing. Public create must return unavailable until configured; no generated test identity may be installed publicly.
- WalletConnect project ID is absent; injected wallets can be configured without inventing one. Hardware/mobile/extension acceptance requires the user or team.
- Existing runtime/admin/Azure management credentials have been shared with teammates historically. Rotation must update all consumers and invalidate old handoffs deliberately, not silently break teammates. This pass must report rotation status explicitly.
- AI external cost is never unlimited: request caps are not billing guarantees; public provider remains disabled unless explicitly configured after review.
- Project X and judge access still need actual accounts/approval. Prepared submission docs are not sent/published automatically.

Final release status and test evidence will be recorded in the completion report; none of the above authorizes a claim that public wallet/task/AI routes already work.
