# On-chain API contract

Implemented and locally verified; optional and OFF by default. No production deployment, signer, migration or writes. Routes below are under `/api/v1`, with existing wallet bearer authentication and exact configured browser Origin/audience checks. No role signup, client wallet impersonation, or BFF bypass.

## Frontend integration: lifecycle and immutable local evidence are separate

The workspace task status remains `accepted_unfunded`; it is NOT the escrow financial status. Existing local `delivery.state`, submissions, reviews and disputes remain immutable offchain evidence. Display `lifecycle.task_state` and the corresponding chain allocation separately. Never infer funding from a creation proof or a local review.

- `GET /onchain/config`: `{enabled,chain_id,escrow_address,confirmations,attestation_available}`. No RPC URL/key material. Disabled config has empty escrow and false availability.
- `POST /tasks/{id}/onchain/reconcile`: buyer/worker only. First binding requires `{transaction_hash:"0x<64 hex>"}` identifying TaskCreated. Once bound, `{}` refreshes; an optional transaction hash must match a verified event for THIS bound task (creation, funding, review, revision, dispute, handover, settlement or completion). A valid unrelated hash returns 409. Unknown/status/round/task-ID fields are rejected. Client hashes are lookup hints, never state assertions. Binding compares the accepted canonical manifest, participants, both arbiters, chain/domain/attestor, content/version and every ordered amount/revision/review/deadline.
- `GET /tasks/{id}/onchain`: buyer/worker only. Same response as reconcile; 404 if unbound. Re-verifies immutable creation and a current confirmed lifecycle snapshot every time, including after reorgs.

Response keeps existing top-level creation fields:

`{task_id,chain_id,escrow_address,onchain_task_id,transaction_hash,block_number,block_hash,manifest_digest,lifecycle}`

Top-level transaction/block fields ALWAYS describe creation. `lifecycle` is:

`{chain_id,escrow_address,onchain_task_id,manifest_digest,block_number,block_hash,timestamp,task_state,settled_count,allocations,events}`

- `task_state`: `awaiting_worker`, `accepted_unfunded`, `funded`, `completed`.
- Each allocation: `{deliverable_id,index,state,round,evidence_round,revisions_used,submitted_at,dispute_opened_at,handover_at,worker_award,buyer_refund,ever_submitted,artifact_hash,attestation_expiry,settlement_nonce,local_state,local_version,evidence_matches,next_local_submission}`.
- Allocation `state`: `awaiting_submission`, `in_review`, `disputed`, `settled`. Revision is `awaiting_submission` with `revisions_used > "0"`, not a new enum.
- `round` = revisionsUsed + 1; `evidence_round` identifies the latest EvidenceRecorded round (empty if none). During revision-awaiting these differ. `evidence_matches` compares BOTH chain evidence round and artifact hash with the latest local submission. Chain hash has `0x`; local hash does not.
- `next_local_submission` indicates compatible chain/local round and nonterminal history, not transaction authority or a receipt. Submission/attestation are revalidated on request. Deadline/RPC/expiry/races may still reject an action.
- Each event: `{name,index?,transaction_hash,block_number,block_hash,log_index,data,topics}`. `data/topics` are canonical ABI hex; index is omitted on task-level events. Event identity is block hash + transaction hash + log index; do not deduplicate just by transaction hash.
- All chain numeric fields are decimal strings, including timestamps, rounds, amounts, block/log indexes and nonce; allocation `index` and `local_version` are JSON integers. Booleans remain booleans.

Supported receipt-linked event names: TaskCreated, DeliverableConfigured, DeliveryDeadlineConfigured, WorkerAccepted, TaskFunded, SubmissionRecorded, EvidenceRecorded, RevisionRequested, DisputeOpened, DisputeHandover, DisputeResolved, DeliverableAccepted, TimeoutClaimed, UnsubmittedRefunded, AgreementSettled, TaskCompleted. State comes independently from block-pinned getters; events are checked against successful receipts/canonical blocks, emitter, task/index and ABI shape. Evidence/dispute/handover/revision/award fields are cross-linked to state. Settlement is allocation credit, NOT proof of withdrawal.

## Arbiter discovery and evidence

- `GET /arbiter/disputes?limit=50&cursor=...`: returns `{disputes:[{task_id,deliverable_id,manifest_hash,version,artifact_hash,created_at,evidence_source?,onchain?}],next_cursor:null|string}`. A nominated primary OR backup sees only a persisted workspace dispute OR a currently verified onchain disputed allocation. Enabled chain discovery refreshes already-bound workspace tasks without needing a participant to reconcile after DisputeOpened. It never enumerates arbitrary contracts/unbound chain tasks.
- `evidence_source`: `workspace`, `onchain`, `workspace_and_onchain` when enabled. Legacy disabled queue may omit it. Summary version/hash remain LOCAL evidence, not chain proof. `onchain` is a scoped lifecycle snapshot containing ONLY the disputed allocation and that allocation's events, never sibling artifacts/events.
- Enabled pagination scans at most `limit` candidate allocations per page; a page may have fewer cases or be empty while `next_cursor` is non-null. Continue until null. Cursor order is task UUID + deliverable ID; live pages are not a historical snapshot.
- `GET /arbiter/tasks/{id}/deliverables/{deliverable}/evidence`: `{task_id,deliverable_id,manifest_hash,deliverable,source,delivery,onchain}`. `delivery` is unchanged local evidence for that allocation; a chain-only dispute does NOT invent a local dispute. `onchain` is scoped as above or null when unavailable/unbound/disabled. Nominated arbiter plus a dispute on THIS allocation is mandatory; unrelated/nondisputed siblings and general tasks/submissions endpoints remain inaccessible.
- Current chain-only cases disappear after settlement or a reorg removing the dispute. Persisted local disputes remain historical evidence even after chain settlement, with a separate settled snapshot when chain is enabled. Neither queue visibility nor nomination grants current adjudication authority: contract windows and recorded handover remain authoritative.
- Enabled RPC failure on a bound candidate fails the request with 503, never silently serving stale chain-only access. Disabled mode retains the original local-only queue.

## Safe revision and availability path

1. Worker persists inline artifact through existing `POST /tasks/{id}/deliverables/{deliverable}/submissions` (existing strict payload, idempotency, expected_version and artifact_hash). Its historical `unfunded_review:true` flag describes the local evidence protocol, not financial state.
2. Worker requests `POST /tasks/{id}/deliverables/{deliverable}/onchain/availability` with `{artifact_hash:"<64 lowercase hex>",expected_version:1}`. Requires exact current immutable persisted submission, buyer retrieval path, confirmed funded/submittable allocation and matching chain round. Returns `{task_id,deliverable_id,onchain_task_id,index,round,artifact_hash,manifest_digest,expiry,digest,signature,chain_id,escrow_address}`. Signature is EIP-712, not personal_sign. Backend never broadcasts a transaction.
3. After an actual onchain revision request, the next local submission may append without a fabricated buyer review if local state is `submitted` or `revision_requested`, previous artifact AND evidence round match, chain is funded/awaiting_submission, and next round is exactly local version + 1. New submission stores `chain_revision:{block_number,block_hash,round}`; full matching RevisionRequested receipt is available in lifecycle events. All old rows remain intact. Bound submissions ahead of chain are rejected. Unbound/disabled local flow remains unchanged.
4. Local `accepted` or `disputed` terminal history is NEVER cleared or overridden. Chain/local conflicts, skipped rounds, mismatched artifacts and terminal local history block submission/availability with 409. Frontend must display the separate evidence states; this implementation does not offer destructive reset or operator remapping. Do not record terminal local acceptance if the intended action is solely an onchain transition.

Availability validates artifact bytes, worker/manifest provenance and the same local history used by buyer retrieval; only inline JSON is attested, not remote URLs embedded as text. Short-lived signatures serialize on the task row and persist before response. Same-round/same-artifact retries reuse a still-valid receipt. Maximum lifetime 120 seconds; first-submission expiry is capped at immutable deadline. Each issuance cross-checks the onchain submissionDigest. No quality judgment or withdrawal authority is attested.

## Configuration, verification and bounds

Server-only: `PACTRA_ONCHAIN_ENABLED=false` (default), `PACTRA_ONCHAIN_RPC_URL`, `PACTRA_ONCHAIN_ESCROW`, `PACTRA_ONCHAIN_CONFIRMATIONS`, `PACTRA_ONCHAIN_ATTESTOR_KEY_FILE`. Key file must be private; never NEXT_PUBLIC. Missing signer disables availability, not read reconciliation. No public/private production key is supplied. Startup validates configured chain/code presence/domain/attestor/schema; confirmations must be 1–256.

Additive `backend/migrations/0005_onchain.sql` persists creation bindings and availability receipts in private append-only tables. Runtime needs SELECT/INSERT only. No additional migration for lifecycle: snapshots/event linkage are read-through verified observations, NOT a durable background indexer. Existing task/local history is not rewritten. Manual reviewed migration only.

RPC must support historical state/code, EIP-1898 blockHash+requireCanonical, receipts, canonical block lookup and eth_getLogs. The selected CURRENT confirmed block is rechecked for canonicality after all lifecycle reads (in addition to creation/event block checks); creation confirmation-tip canonicality is also rechecked. One trusted configured RPC remains a trust boundary, not a light client or multi-provider finality system.

Reads are bounded: at most 200000 blocks between creation and snapshot, log requests in chunks of 2000 blocks, at most 4096 task events, existing 2 MiB RPC response limit and existing 5-second API context. Bounds, unsupported RPC, inconsistent/removed logs, missing linked events or reorgs fail closed with 503. Large/old tasks need a reviewed durable indexer/checkpoint design; no partial-success claim. There is no automatic stale immutable binding recovery.

Errors retain `{error:"HTTP status text"}`: 400 malformed/unknown/duplicate fields or absent first-binding hash; 401 auth; 403 role/Origin; 404 absent/inaccessible resource; 409 stale/conflicting local state or unrelated reconciliation hint; 503 disabled/RPC/schema/deployment/verification failure. Never render errors as successful funding/settlement.

## Verified scope and remaining release gaps

Real isolated PostgreSQL + ephemeral Anvil regression covers creation/acceptance/funding, backend-signed review, chain-only revision without synthetic review, round-two submission, chain-only primary/backup discovery, nondisputed sibling exclusion, candidate pagination, actual reorg removing only dispute/current block, handover, backup split resolution, never-submitted sibling refund, completion, withdrawal not corrupting task snapshots, and fail-closed after chain reset. Separate real DB regression preserves accepted/disputed local terminal history. Full backend race suite and vet run are recorded in `/root/pactra-settlement-backend-final.md`.

Acceptance, timeout and bilateral AgreementSettled are parsed/cross-linked by this adapter but are NOT separately exercised by this backend EVM regression; contract tests are independently owned. WithdrawalExecuted is account-wide, has no task ID and is deliberately excluded: no per-task withdrawal attribution or balance indexer. No arbitrary chain-only task discovery without workspace manifest/binding, persistent lifecycle indexer, signer rotation, bytecode allowlist, production retention/availability guarantee, live deployment, or frontend end-to-end verification is claimed. Public settlement policy is unchanged.

Local command: `TEST_DATABASE_URL='host=/var/run/postgresql port=5546 user=root dbname=pactra_settlement_backend sslmode=disable' PACTRA_LOCAL_EVM_TEST=1 go test -race ./... -count=1` from backend. EVM test rejects other DB/port/remote host and uses only ephemeral loopback Anvil, built contract artifact and generated fixture identities, not real nominated arbiter keys.
