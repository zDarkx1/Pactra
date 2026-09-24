# Operations verification — full current schema0001–0004, local only

Checkpoint: 2026-09-24 UTC. This pass changes only the owned operations files:

- `scripts/pactra-backup-restore.py`
- `scripts/pactra-auth-cleanup.py`
- `scripts/test_pactra_ops.py`
- `docs/OPERATIONS_VERIFICATION.md`

The execution transcript is `/root/pactra-ops-full-result.txt`. Root-level operations/deployment/readiness documents are not edited by this pass; the parent will reconcile those separately.

## Verified scope

The full current schema was actually encrypted, backed up, restored and checked on the existing PostgreSQL16 cluster at port5546, using `/var/run/postgresql` and role `root`. This is local storage verification, not production or hosted disaster-recovery verification. No hosted services, production secrets, deployment, Git commands, application-file changes or builds were involved.

The test runner creates randomly suffixed `pactra_ops_*` sources and `pactra_restore_*` targets from template0. Database creation/drop uses the local `postgres` administrative connection; all fixture/data mutations are confined to its generated databases. The tools themselves do not provision or drop databases. Temporary generated keys, connection files and encrypted archives are deleted after the tests.

The primary fixture applies all actual migration files in order:

1. `backend/migrations/0001_workspace.sql`
2. `backend/migrations/0002_task_reliability.sql`
3. `backend/migrations/0003_delivery_review.sql`
4. `backend/migrations/0004_ai_usage.sql`

The runner asserts that these are the complete SQL migration file set, so later additions require an explicit operations review.

Important naming correction: the inspected migration0002 creates `task_idempotency`, not `task_creation_requests`. No alias or invented table was added.

## Strict supported table sets

Exactly two sets are accepted; discovery selects between these explicit allowlists, not arbitrary tables:

- Legacy0001: `accounts`, `challenge_limits`, `challenges`, `sessions`, `tasks`.
- Current0001–0004: the legacy set plus `task_idempotency`, `delivery_events`, `delivery_idempotency`, `ai_usage_global`, `ai_usage_wallet`.

Unknown, missing, or intermediate0001–0002/0001–0003 table sets fail closed. The current `TABLES` constant contains the exact full current set; `LEGACY_TABLES` preserves legacy support. Unsupported source schemas fail before dump publication. Auth cleanup checks the same allowlist before running maintenance. Unsupported authenticated manifest table sets fail before database access; after restoration the actual inventory must also match the manifest exactly.

Table-set validation is not a hardcoded fingerprint of the approved migration DDL: definitions are captured from the source and required to match the restored target. This tool is not a schema certification or hostile-dump sandbox.

## TDD and actual execution

The full-schema tests and additional SQL fixtures were written before implementation was changed. The first red run executed 16 tests and failed with two failures and three errors: the old inventory rejected the actual current schema, and `TABLES` lacked its additional tables. Legacy restore already passed.

After implementation, the next run exposed a test-fixture assertion issue: changing every wallet address hit a primary-key collision before the intended foreign-key check. Restricting that invalid update to one row exercised the foreign key correctly. An additional authenticated-unsupported-manifest test was then included.

Final command, from repository root:

    set -o pipefail; python3 -B scripts/test_pactra_ops.py 2>&1 | tee /root/pactra-ops-full-result.txt

Actual result: `Ran 17 tests in 4.863s` — `OK`, exit0. There were no skipped tests. The suite invokes real PostgreSQL and OpenSSL subprocesses; backup/restore success is not mocked.

Final full-schema drill databases:

- Source: `pactra_ops_db93c409f045`
- Target: `pactra_restore_db93c409f045`

Final legacy drill databases:

- Source: `pactra_ops_ce0a0ed348c8`
- Target: `pactra_restore_ce0a0ed348c8`

Teardown dropped each of these exact generated databases and read back `pg_database` to verify its absence. No drill database or key is intentionally retained.

### Full-schema restored row counts

| Table | Rows |
| --- | ---: |
| accounts | 8 |
| challenge_limits | 5 |
| challenges | 5 |
| sessions | 5 |
| tasks | 1 |
| task_idempotency | 1 |
| delivery_events | 3 |
| delivery_idempotency | 3 |
| ai_usage_global | 2 |
| ai_usage_wallet | 8 |

These are synthetic storage fixtures, not users, funds, provider calls, actual submissions, reviews or dispute evidence. The task remains `accepted_unfunded`. Delivery fixtures cover all three event kinds and idempotency operations. AI fixtures include global and wallet counters at their respective upper bounds. Creation idempotency includes bytea request hashes and response bodies. A separate `outside_pactra.must_not_copy` table is intentionally absent from the restore.

### Assertions exercised

- Exact equality of every table's row count and canonical SHA-256 row fingerprint, plus columns/defaults, constraints, indexes, functions and triggers, between source and restored target.
- Explicit presence of `guard_task_update`, `guard_delivery_history`, all five current user triggers, migration0002 paging indexes, migration0003 partial unique dispute index, and migration0004 challenge-limit expiry index.
- Restored delivery-event and delivery-idempotency triggers reject UPDATE, DELETE and TRUNCATE with `immutable delivery history`.
- The restored partial unique index rejects a second dispute even with a different version. Delivery-idempotency duplicate keys are rejected.
- Creation-idempotency status, request-hash length and task foreign-key constraints remain enforced.
- Global counters reject0/1001; wallet counters reject0/101. Valid updates to1 succeed inside rolled-back transactions, demonstrating counters are mutable unlike delivery history. Wallet account foreign keys remain enforced. Final target fingerprints still equal the untouched restore.
- Existing accepted-task immutability, account/session/challenge/limit constraints remain enforced.
- Actual legacy0001 encrypted backup/restore and dry-run cleanup; actual intermediate schemas are rejected without publishing an archive.
- Unknown source tables block both backup publication and explicit cleanup deletion; removal of only the synthetic unknown table restores the original inventory unchanged.
- Dry-run cleanup changes no rows. Batch2 deletes two, then one, then zero old expired rows per auth table. Recent-expired rows inside retention and unexpired rows, including a consumed unexpired challenge, survive. Every non-auth table, including both usage counters and both delivery tables, remains fingerprint-identical; schema definitions remain identical.
- Tampered/truncated ciphertext and wrong keys are rejected; malformed authentication and unsupported authenticated manifest tables cannot reach database access.
- Output/target overwrite and symlink-output refusal, source/destination namespace separation, private-file validation, connection/environment injection rejection and private descriptor passphrase handling.

The unsupported-manifest unit test deliberately supplies a non-executable synthetic dump marker to test rejection before database access. It is not used as restore evidence; full and legacy restore tests use actual `pg_dump` archives. The OpenSSL descriptor test wraps the real subprocess, while pre-connection rejection tests use mocks only to assert that no database access occurs.

## Connection and filesystem contract

Connection files are plain `KEY=value`, never sourced as shell. Required fields:

    PGHOST=/var/run/postgresql
    PGPORT=5546
    PGUSER=root
    PGDATABASE=pactra_ops_example_only

Source suffixes must contain1..40 lowercase letters, digits or underscores. Restore files require the separate `pactra_restore_` prefix. An optional `PGPASSWORD` is accepted only from the private file, never argv; this socket drill needed no database password.

Only `/var/run/postgresql`, literal `127.0.0.1` or literal `::1` is allowed. No DNS, arbitrary sockets, alternate cluster/role, URI/conninfo names, duplicate/unknown configuration fields, inherited passwords, service files, hostaddr overrides, `.pgpass` or ambient libpq options are accepted. Child processes use an environment allowlist. TCP is allowed by validation but was not the exercised transport.

Config, passphrase and encrypted input files must be caller-owned regular single-link mode0600 files, not symlinks. Store them in owner-controlled mode0700 directories. Parent directories and local PostgreSQL/socket/binary infrastructure must be trusted. This does not defend against malicious root or root-controlled port forwarding.

Passphrases require one line of32..1024 printable non-space characters. Generate a random key in a private location; never paste it into argv, logs, Git or documentation. Tests generate disposable local-only keys automatically. Reports contain counts, not row payloads, tokens, passwords or DSNs.

## Manual CLI reference

Illustrative paths only; both databases must already exist, and the restore target must be exclusively reserved and empty:

    python3 -B scripts/pactra-backup-restore.py backup --source-env /private/source.env --passphrase-file /private/backup.key --output /private/new-backup.enc
    python3 -B scripts/pactra-backup-restore.py restore --target-env /private/target.env --passphrase-file /private/backup.key --input /private/new-backup.enc
    python3 -B scripts/pactra-auth-cleanup.py --env-file /private/source.env --batch-size 100 --retention-seconds 86400
    python3 -B scripts/pactra-auth-cleanup.py --env-file /private/source.env --batch-size 100 --retention-seconds 86400 --delete

Cleanup defaults to dry-run, one batch per auth table, and one day retention after expiry. Sessions/challenges use `expires_at`; challenge limits expire at `window_start + 1 minute`. Consumed challenges are not eligible solely because they are consumed. Batch bounds are1..1000, retention bounds0..31536000 seconds. Explicit deletion uses a transaction, row locks, `SKIP LOCKED`, statement and lock deadlines. No cleanup SQL deletes tasks, accounts, idempotency, delivery history or AI usage. No scheduler was installed.

Do not run migrations concurrently with these operations. Backup table discovery, row/schema inventory and dump share an exported read-only repeatable-read snapshot. Cleanup's schema preflight and maintenance transaction are separate; concurrent DDL protection is not claimed.

## Archive and restore boundaries

- `pg_dump --format=custom --schema=pactra --no-owner --no-privileges` shares the inventory snapshot. Explicit UTC stabilizes timestamp fingerprints.
- The encrypted payload contains `pactra.dump` and a JSON manifest with provenance, dump hash and inventory. Plaintext archive contents remain in memory/pipes, not persisted files.
- The envelope uses versioned magic, random MAC salt, OpenSSL salted AES-256-CBC with PBKDF2-SHA256/200000 iterations and HMAC-SHA256 over header/salt/ciphertext. The MAC key has domain-separated derivation. Authentication precedes decryption and database access.
- OpenSSL receives its passphrase through a private temporary file descriptor, not secret-bearing argv. Temporary key material is removed after use.
- Archive publication uses a same-directory private temporary file, fsync and atomic no-replace hard-link creation. Resulting archive mode is0600; no overwrite option exists.
- Restore checks source provenance, distinct destination, dump hash, supported manifest table set, local server identity and an empty isolated database. `pg_restore` uses a single transaction, exit-on-error, no owner/ACL restoration, no `--clean` and no database creation.
- Actual restored inventory must equal the manifest before reporting `verified:true`. A verification mismatch leaves the isolated target for investigation and reports failure rather than resetting it automatically.

## Limits and remaining work

Full current schema0001–0004 storage restoration is verified locally. Production/hosted restoration, deployment readiness, provider integration, funding and real activity are not verified or implied.

Owner/role grants, schema/public ACLs, default privileges, extensions, large objects and data outside `pactra` are not disaster-recovery coverage. Restore deliberately strips owner/ACL statements; do not promote a drill target into production. Least-privilege access and production ACL restoration require a separate approved procedure.

The allowlist covers the ordinary tables in these migrations, not a general-purpose validator for every PostgreSQL object type. Rows/archives are held in memory; large-dataset capacity, streaming, interruption recovery, key rotation/recovery, concurrency stress and power-loss durability remain untested. Only trusted locally generated archives should be restored: SQL function definitions in PostgreSQL dumps are executable database code, and this local drill runs as database role `root`. Encryption is not a sandbox.
