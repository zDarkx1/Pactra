Persistent workspace contract
=============================

Import pactra/backend/internal/workspace.

    type Config struct {
        Domain, URI string
        ChainID int64
        Arbiters []string
    }
    func New(pool *pgxpool.Pool, config Config) (http.Handler, error)

New validates configuration and returns a handler; it neither connects/migrates
nor owns/closes the pool. Parent mounts /api/v1/auth/, /api/v1/me,
/api/v1/tasks and /api/v1/tasks/. Existing checker/Azure routes remain separate.
Domain must equal URI authority; HTTPS required except http://localhost[:port].
ChainID must be positive. Arbiters must be nonzero EVM addresses. An empty team
allows login/read but task creation returns 503.

Owner applies backend/migrations/0001_workspace.sql once, before runtime start.
This creates only pactra tables, revokes PUBLIC privileges on pactra AND
public schemas, and installs an immutable-task trigger. Review impact of public
schema revocation before applying to a shared database. Runtime needs only:

    GRANT USAGE ON SCHEMA pactra TO your_runtime_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pactra
        TO your_runtime_role;

Do not make runtime an owner or grant CREATE/schema modification rights.
Application authorization provides participant isolation; this is not SQL RLS.
Only trusted server code may access the runtime connection. Account foreign
keys, address checks, state/deadline constraints and a trigger protect storage.

All routes use /api/v1. JSON bodies are objects, maximum 64 KiB, with unknown
fields, duplicate keys, null values, excessive nesting and trailing data rejected
(400). Schema names are exact and case-sensitive, including nested deliverables;
free-form source keys preserve case (worker and Worker are distinct). Invalid
UTF-8 and unpaired Unicode surrogate escapes are rejected before decoding.
Cancellation/logout bodies must be {}. Successful responses are JSON
except logout (204). Errors expose only {"error":"<HTTP status text>"}; no SQL
or signature details. Database work has a five-second request context timeout.
Parent should also configure HTTP body/read/header/write timeouts and TLS.

Authentication
--------------
POST /auth/challenge {"address":"0x..."}
  201: {challenge_id, message, expires_at}
  message is the exact stored EIP-4361 SIWE message: configured domain, EIP-55
  account, statement "Sign in to Pactra.", configured URI, version 1, chain,
  random 32-character hexadecimal nonce, UTC issued/expiry timestamps (5 min).
  Sign exactly message using personal_sign / EIP-191. Do not reconstruct it.
  Durable per-account five/minute fixed-window limit uses an atomic row-locking
  UPSERT. Socket-peer IP allowance: ten attempts/minute, shared across handlers
  in this process, before parsing or DB access. IPv4-mapped IPv6 is normalized.
  Forwarded/X-Forwarded-For headers are ignored. Behind a reverse proxy or NAT,
  clients share the peer IP quota; trusted proxy support is not implemented.
  The IP cache holds at most 1024 entries, expires entries after one minute,
  and rejects new peers when full rather than evicting active limits.
  Process-wide ceiling: sixty committed challenges/minute; per-address rejects
  and transaction failures do not spend that quota. Limit exceeded: 429.
  These process limits are not distributed deployment-wide limits.
POST /auth/verify {"challenge_id":"uuid","signature":"0x..."}
  200: {token, token_type:"Bearer", expires_at, address}
  Accepts 65-byte r/s/v signatures, v 0/1 or 27/28, low-s canonical only.
  go-ethereum performs EIP-191 hashing, canonical validation and recovery.
  Wrong/zero/malformed/high-s/expired/replayed signatures: 401.
  Row lock + conditional consume + session insert in one transaction prevents
  replay. Wrong signatures do not consume the challenge.
  Token: random 32 bytes encoded as hex, expires after 24h; only SHA-256(token)
  is persisted alongside address, expiry and audience. Audience is the exact
  JSON tuple [Domain, URI, ChainID]; session lookup and logout require a match.
  Stored challenge messages are checked against the current domain/URI/chain
  before redemption. Changing any audience component invalidates prior tokens.
  Migration 0001 includes the required nonempty sessions.audience column (no
  default); it is an initial, not an upgrade, migration. SQL session fixtures
  must supply this tuple. Store bearer tokens securely and never log them.
GET /me, Authorization: Bearer <token>
  200: {address}; invalid/expired/revoked session: 401.
POST /auth/logout, Authorization: Bearer <token>, body {}
  204; deletes the session hash, immediately invalidating subsequent requests.

Task creation
-------------
POST /tasks, Authorization: Bearer <buyer token>

    {
      "title":"Build a proof",
      "source":{"repository":"https://example.com/repository"},
      "worker":"0x...",
      "primary_arbiter":"0x...",
      "backup_arbiter":"0x...",
      "delivery_deadline":"2026-10-01T12:00:00Z",
      "deliverables":[{
        "id":"proof-1",
        "title":"Proof",
        "criteria":"Tests pass",
        "amount_base_units":"123",
        "revision_limit":2,
        "review_period_hours":48
      }]
    }

Use a deadline 1h..90d in the future at request processing time, not the example
literal date. Title/deliverable title: 1..160 Unicode characters (not blank).
Source: required flat string object, at most 100 keys and 16 KiB encoded JSON;
keys 1..160 characters; empty source object/string values are allowed.
Buyer/worker/primary/backup must all differ and be nonzero EVM addresses.
Primary and backup must be in configured allowlist. Addresses normalize to
lowercase. Deliverables: 1..10; unique lowercase alphanumeric hyphen-separated
slug IDs <=64 bytes; criteria 1..4000 characters; positive decimal uint256
STRING amount with no leading zero; sum must also fit uint256. Revisions 0..5,
review 24..168 hours. Input validation failure: 400. Empty arbiter team: 503.

201 response: {id, status:"invited", manifest, manifest_hash, created_at,
invite_expires_at}. Manifest includes every input term plus version=1, chain_id,
buyer, total_base_units, invite_expires_at, primary_arbiter_hours=48 and
backup_arbiter_hours=48. Invitation expires at min(created_at+72h, deadline).
There is no task editing API, and SQL trigger prevents term updates.

Fingerprint
-----------
manifest_hash is lowercase unprefixed SHA-256 of manifest_json stored in DB.
This is an application terms fingerprint, NOT an onchain commitment.
Canonical JSON is compact Go encoding/json with recursively lexically sorted
object keys, default HTML escaping, no trailing newline, normalized UTC RFC3339
timestamps and lowercase addresses, ordered deliverable arrays, policy integers
and decimal STRING amounts. It is not RFC8785/JCS. Consumers should use the
returned hash for acceptance rather than their native JSON stringify output.

GET /tasks: {tasks:[...]}, newest first (created_at, UUID), hard limit 50.
No pagination in this increment. GET /tasks/{uuid}: task response above.
Only buyer and worker can see unfunded tasks; designated arbiters have no
pre-dispute access. Outsiders get 404 for individual routes and no entries in
list. Malformed/missing UUID gets 404.

POST /tasks/{uuid}/accept {"manifest_hash":"<exact returned hash>"}
  Worker only. Locks row, checks invited/unexpired state and exact hash, then
  atomically transitions to accepted_unfunded. Returns 200 task; conflicts 409.
POST /tasks/{uuid}/cancel {}
  Buyer only, invited state only; atomically transitions to cancelled.
  Buyer may cancel an expired invitation that is still invited. Returns 200
  task; conflicts 409. Existing nonauthorized participants get 403.
Accept/cancel races have exactly one winner, with the loser returning 409.

Verification and operations
---------------------------
Local integration tests use only TEST_DATABASE_URL. They DROP the pactra schema,
reapply migration, and create/drop a temporary restricted role; isolated test
DB owner privileges are required. NEVER point this at a real workspace DB.

    set -a; source /tmp/pactra-test-db.env; set +a
    unset PACTRA_LIVE_TEST_DATABASE_URL
    /root/.local/toolchains/go1.27.1/go/bin/go test -race -count=1 ./internal/workspace
    /root/.local/toolchains/go1.27.1/go/bin/go vet ./internal/workspace

Run from backend. Without TEST_DATABASE_URL integration tests explicitly skip.
Tests cover real DB auth/task flow, low-s/replay/wrong signer/expiry, concurrent
verify and accept/cancel, role privacy, runtime DML-only privileges, SQL
constraints, exact JSON names/Unicode, audience isolation, input bounds,
global/durable/IP limits, cache capacity/TTL and canonical JSON/hash checks.
Review regression tests were observed failing before fixes and passing after.
The separate hosted smoke requires PACTRA_LIVE_TEST_DATABASE_URL explicitly;
it is not part of local verification and never applies/drops schema.

No funding, submissions, blockchain RPC or provider calls in this module.
No background expiry deletion, retention policy, pagination or distributed
global limiter yet. Expired rows are denied by time predicates; operations
should schedule owner-approved cleanup of expired challenges and sessions.
