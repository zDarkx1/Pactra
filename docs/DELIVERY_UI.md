# Delivery review UI verification

## Scope and integration

Worked on `feature/non-contract-workspace`. This worker wrote only:

- `frontend/lib/delivery-types.ts`
- `frontend/components/tasks/delivery-review.tsx`
- `frontend/tests/delivery-types.test.ts`
- `docs/DELIVERY_UI.md`

Named and default component export: `DeliveryReview`, taking `{ task: Task }`. The parent can render `<DeliveryReview task={visibleTask} />`; the parent's import/render was present at final inspection. No edits to parent task-detail, transport, backend, package files, or other workers' files were made by this worker.

Transport exports are `parseDeliveryHistory(value)` and `parseDeliveryMutation(value)`. Both parse the actual snapshot directly, not an invented wrapper. The shared workspace client/proxy now use these exports. Requests call the real `workspaceRequest`, using `/tasks/{id}/deliverables/{deliverable}/submissions`, `/reviews`, and `/disputes`; the shared transport supplies the `/api/workspace` and Go `/api/v1` prefixes.

The API document was present before implementation and re-read after backend verification was published. Schema was checked against `backend/internal/workspace/delivery.go`, `backend/handler.go`, backend UUID/slug validation, and immutable manifest revision bounds. Backend test results in `DELIVERY_API.md` belong to the backend worker, not this worker's claimed execution.

## Behavior

- Render only for `accepted_unfunded` and a signed-in buyer or worker from `useWorkspace`.
- Explicit warning: no deposit, no obligation to start work, no financial deadlines. No payment controls, timer, automatic acceptance, arbiter adjudication, or invented task status.
- Per-deliverable immutable version history, complete artifact and manifest hashes, actors, real event timestamps, submission/review/dispute notes, stored artifact disclosure, and actual recorded checker output.
- Checker evidence is explicitly default metadata, not inferred agreed acceptance criteria. Actual checker input rejection is displayed as rejection, not pass/fail evidence. Human review remains possible after checker failure or input rejection.
- Worker submits raw flat JSON, preserving original duplicate keys/escapes for authoritative Go rejection. Revisions are enabled only after a revision request and when backend revision limit/history leaves capacity.
- Buyer accepts or requests revision against the exact latest version/hash. Acceptance is described as terminal, including against disputes. Either participant can flag a dispute before terminal acceptance; the confirmation explains permanent review freeze and no automated arbitration/resolution.
- Every action opens a React Aria confirmation dialog with a new unchecked acknowledgment. Only an explicit checked acknowledgment permits an intent containing `unfunded_review: true`. The dialog shows exact expected version/artifact/manifest hashes, notes, and raw submission disclosure when applicable.
- UUID v4 idempotency key generated once per confirmed intent. Immutable raw body/key retained in memory after network, invalid-success, 408, 409, or 5xx uncertainty. New edits/actions stay blocked. No automatic POST retry. Manual retry first reads server history, then uses the original intent unchanged; a read failure prevents that POST. A later rejection cannot unlock an earlier uncertain intent.
- Successful idempotent mutation snapshots may be historical. They are validated but never installed as current history; the UI performs a fresh GET before unlocking actions. Definite initial rejection permits correction without erasing the draft.
- Identity/task/session/chain keys remount the private subtree synchronously. Layout teardown aborts outstanding reads/writes and clears retained intent references; late results are discarded. 401 uses shared session-expiration behavior and `SessionExpired`; 403/404 clears private history and removes editors. No localStorage, sessionStorage, IndexedDB, artifact logging, raw HTML rendering, or automatic clipboard writes.
- React Aria controls/dialog/checkbox, existing Tailwind task utility styles, and existing Phosphor-backed Icon component. No inline styles or new stylesheet.

## Parser guarantees

Strict exact field sets; plain objects; copied/projection output; canonical lowercase UUID-v4 and SHA-256 format; participant-address format; accepted_unfunded/acknowledgment literals; bounded slug/notes/Unicode/artifact strings; bounded arrays (six submissions/reviews, one dispute, 300 default metadata checks); revision/version limits; checker enums/error HTTP-code consistency; checker aggregate pass consistency; and artifact flatness/100-key/16-KiB decoded-minimal-JSON bounds.

History validation ties review/dispute hashes to referenced submissions, all manifest hashes together, latest fields to actual history, sequential versions to revision requests, and terminal/frozen state to events. It rejects fabricated state labels, unknown fields, nested/null artifact values, malformed Unicode/NUL, excess revisions, impossible terminal transitions, and missing events. Response hashes are validated and preserved, not normalized or recomputed using an incompatible browser canonicalizer. The component separately binds snapshots and event actors to the current task/deliverable/participant manifest.

## Actual execution

TDD red: parser tests were written first. Running `node --experimental-strip-types --test tests/delivery-types.test.ts` failed with `ERR_MODULE_NOT_FOUND` for the not-yet-created delivery-types module.

Final commands from `frontend`:

    node --experimental-strip-types --test tests/delivery-types.test.ts tests/transport-reliability.test.ts tests/workspace-proxy.test.ts
    tests 47; pass 47; fail 0

    ../node_modules/.bin/tsc --noEmit --incremental false
    exit 0; no diagnostics

The delivery-owned suite contains 10 passing tests, including genuine parser rejection paths, full revision/review/dispute examples, real checker error schema, exact UTF-8 byte boundary, real Node SHA-256 computation used as a test value, safe `__proto__` data handling, raw duplicate preservation, immutable intent/UUID fields, and static UI safety-wiring assertions. Fixtures are explicitly synthetic contract fixtures, never represented as live user submissions or actual checker runs.

An earlier combined run found two failures in other workers' files: client response/path mismatch validation and an AI route status expectation. Those owners changed their files during this task; the final combined run above passes without this worker editing either file.

`git diff --check` passed. No npm install, npm build, commit, push, deploy, hosted database access, or delegation.

## Limitations / remaining verification

- Browser interaction, visual layout, screen-reader output, focus restoration, and delayed-network component lifecycle were not exercised in a browser. The UI wiring assertions are static regression checks, not a substitute for those tests. Typecheck verifies component/type integration.
- An optional isolated checker-server smoke attempt was blocked by the terminal command security scanner before execution. No checker/API result was fabricated or substituted. Contract compatibility is grounded in actual source and the backend worker's published verification, not a live end-to-end run by this worker.
- The uncertain intent is deliberately memory-only. Leaving the view/reloading/changing identity discards it; returning users must inspect authoritative history before another action. A permanent conflict may keep the current view locked until it is left; the UI does not silently invent a replacement idempotency key.
- Server duplicate-key/Unicode validation is authoritative for raw submission JSON. Local validation checks shape and bounds but deliberately does not reserialize raw input to erase duplicate keys.
- These parsers receive already-decoded JSON, so they do not detect duplicate response keys at the raw HTTP text layer. They reject malformed decoded shape, unknown fields, and inconsistent histories.
- A full authenticated browser-to-proxy-to-PostgreSQL scenario remains for parent integration verification. No claim of deployment or production availability is made.
