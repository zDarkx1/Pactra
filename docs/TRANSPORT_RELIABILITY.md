# Workspace transport reliability

Ownership: frontend/lib/workspace-proxy.ts, workspace-client.ts, new workspace-path.ts; components/tasks/task-form.tsx and task-list.tsx; new tests/transport-reliability.test.ts; this outcome document. No other agent-owned files changed by this work. No commit, push, build, deployment, hosted database or secrets access.

## Integration handoff

The parent owns frontend/app/api/review/route.ts and has now installed delegation to handleWorkspaceRequest(request, ['review']), retaining runtime='nodejs' and maxDuration=40. This was read back and exercised by the new parent-route test. The BFF owns origin, session, expected wallet/chain, opt-in environment flag, bounded raw request, timeout and advisory validation.

The delivery helper owner has now supplied delivery-types.ts. Transport dynamically imports parseDeliveryHistory and parseDeliveryMutation and calls either with the decoded unknown response; it additionally binds the parsed task_id and deliverable_id to the requested route. Both successful parsers and mismatched-target rejection have been exercised. No replacement parser was written in this work.

## Implemented behavior

- Shared exact path/method whitelist for tasks, pagination, delivery submissions GET/POST, reviews/disputes POST and advisory review POST. UUID/slug validation before URL normalization; bounded opaque cursor and 1–50 limit; duplicate/unknown query fields rejected.
- Optional task-create Idempotency-Key UUID is validated before forwarding, including rejection of combined headers. Original JSON text is forwarded byte-for-byte after the existing size and object checks so duplicate keys reach authoritative Go validation. No automatic mutation retries.
- Task creation uses a memory-only attempt with an immutable raw body and crypto.randomUUID key. Network/timeout/5xx ambiguity locks editing and enables only explicit same-attempt retry. A later rejection cannot prove an earlier ambiguous write was not committed. Identity invalidation or unmount disposes the attempt and aborts active work; no localStorage or source persistence.
- Task list load-more appends in order with ID deduplication, carries next_cursor, preserves prior successful pages after transient failures, aborts superseded reads and discards stale results. Refresh replaces from page one. Identity invalidation clears all loaded pages. Legacy {tasks} responses remain supported without advertising load-more.
- /api/workspace/review is disabled unless PACTRA_PUBLIC_AI_ENABLED is exactly true. It requires the same session/origin/expected wallet and chain checks. Input limit 16 KiB, upstream review timeout 35 seconds (identity read 10 seconds), output limit 256 KiB. Response requires completed/advisory=true, exact full intersection coverage, unique keys, exact supplied excerpts, permitted assessment enum and nonblank explanation <=2000 UTF-8 bytes. Provider/model metadata is not exposed. Nothing claims acceptance, payment or fabricated review evidence.
- Production HTTP upstream is allowed only for literal http://127.0.0.1[:port] or http://[::1][:port], optional trailing slash. Hostnames, numeric aliases, other loopback addresses, nonloopback HTTP, credentials and unsupported protocols are rejected; HTTPS remains supported. No redirect following, bearer exposure or public caching.
- Immutable Task.status remains invited/cancelled/accepted_unfunded. No funds, arbiters or evidence are invented.

## Actual TDD execution (intermediate)

Initial npm test -- --test-name-pattern=transport actually ran the full script glob: 120 tests, 105 pass, 15 fail. All failures were the newly added transport requirements, before implementation.

After implementation, npm test: 121 tests, 119 pass, 2 fail. All 15 new transport tests passed. The two failures are outside this ownership in tests/tailwind-surfaces.test.ts, changed by the parallel authenticated AI UI behavior: signed-out AI now omits the consent button rather than rendering a disabled button; transport now uses same-origin authenticated workspaceRequest rather than credentials:omit. These obsolete tests need owner updates preserving signed-out exclusion, signed-in consent gating, cancellation and no-store coverage. They were not weakened or modified here.

npm run typecheck: failed only on missing delivery-types.ts imports in workspace-client.ts, workspace-proxy.ts and the helper owner's new delivery-types.test.ts. No parser stub added.

The tests use isolated fetch responses and explicit contract fixtures, not claimed live task creation, funded tasks, real arbiter identities or provider review evidence. No Go code was edited or Go suite run by this frontend owner.

## Final verification for this ownership

- New transport-reliability.test.ts contains 23 passing tests. Additional red/green coverage caught mismatched delivery target acceptance and malformed query normalization before those were fixed.
- `node --experimental-strip-types --test tests/transport-reliability.test.ts tests/session-lifecycle.test.ts tests/delivery-types.test.ts`: 36 tests, 36 pass, 0 fail, 0 skipped. Includes actual helper parser integration and the parent /api/review delegation.
- `npm run typecheck`: passed after the helper module arrived.
- `git diff --check`: passed.
- Latest full `npm test`: 136 tests, 133 pass, 3 fail. All new transport tests and helper tests pass. Two failures remain the parallel AI UI obsolete assertions described above. The third is tests/workspace-proxy.test.ts:132: its legacy production-disabled request omits Origin, so the delegated BFF correctly returns 403 before reaching the disabled flag rather than the old route's 503. Owner should send exact configured Origin to test disabled=503 and separately retain originless=403 coverage. New transport tests already assert exact-origin disabled=503 and enabled-without-session=401 with zero upstream calls. Existing tests were not modified in this ownership.

Historical helper boundary: the three obsolete assertions above were subsequently updated by the parent; the final suite passed 143 tests with one fixture-dependent skip, and that fixture test passed through real Go-generated responses. Integrated browser evidence and independent final review are recorded in [NON_CONTRACT_VERIFICATION.md](NON_CONTRACT_VERIFICATION.md). The isolated transport tests alone do not establish browser coverage.
