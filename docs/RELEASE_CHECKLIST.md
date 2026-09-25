# Release checklist and bounded hosted backup

## Evidence levels — do not collapse these gates

- Local implementation: source changes and offline tests are not public deployment evidence. Main UI PR #2 is merged at `9bfd741` (verified in this checkout). Subsequent settlement work must be identified by its own reviewed revision.
- Live deployment: record the actual served frontend/backend revision, configuration readiness and authenticated browser/API evidence separately. A main-branch merge does not prove the live host serves it.
- Testnet: requires a real chain ID, deployed contract address, source/build provenance and successful receipts with explorer links. Local Foundry/Anvil fixtures do not qualify.
- Mainnet: requires separate approval, real deployment/readback and real activity. Testnet evidence is not mainnet evidence. No public full on-chain lifecycle is established by this checklist.

The user has supplied real arbiter wallets. Older notes saying arbiter inputs are missing are historical, not the current input status. This does not establish that the correct addresses are configured publicly, have consented to the final role, or have performed a transaction. Do not generate substitute public identities. Do not publish private handoffs, credentials or account details.

## Local implementation gate

- [x] Main UI merge checkpoint inspected: `9bfd741`, PR #2.
- [x] Hosted backup wrapper and offline unittest suite added in `scripts/pactra-hosted-backup.py` and `scripts/test_hosted_backup.py`.
- [x] Offline suite executed: 18 tests passed. It exercises real OpenSSL, anonymous key/CA descriptors, synthetic dump subprocesses, CLI dry-run, safe failure, path/ownership guards, concurrency, retention and owned-file documentation/whitespace checks. It does not connect to PostgreSQL or prove hosted TLS.
- [ ] Integrator reviews final combined diff and runs the application/contract suites for the actual release revision; unrelated concurrent edits are not certified by this ops pass.
- [ ] Record remaining limitations and reconcile older deployment claims against new evidence, rather than silently relabeling historical tests as current production checks.

Run the bounded offline suite from the repository root:

    python3 -B scripts/test_hosted_backup.py

The existing `scripts/test_pactra_ops.py` is a different suite that creates local databases. It was not run in this pass. Prior local full-schema restore evidence is in [OPERATIONS_VERIFICATION.md](OPERATIONS_VERIFICATION.md); it is not hosted disaster-recovery evidence.

## Hosted backup interface — operator-owned configuration

This wrapper only performs backup. It never installs packages, provisions secrets, migrates schema, creates databases, restores data, edits systemd or installs a timer. The parent/operator owns configuration, scheduling, hosted execution and restore.

All of these arguments are required:

    python3 -B scripts/pactra-hosted-backup.py \
      --runtime-config /PRIVATE/runtime-connection.json \
      --expected-host PROJECT_DATABASE_DNS_HOST \
      --schema pactra \
      --ssl-root-cert /PRIVATE/database-ca.pem \
      --key-file /PRIVATE/backup-encryption.key \
      --backup-dir /PRIVATE/pactra-daily-backups \
      --pg-dump /ABSOLUTE/REAL/pg_dump \
      --openssl /ABSOLUTE/REAL/openssl \
      --retain-count 7 --timeout-seconds 120 --max-dump-mib 64 \
      --dry-run

These are deliberately non-operational placeholders, not a deployed command or credentials. Substitute operator-reviewed paths and the exact project database hostname privately. Omit `--dry-run` only for an explicitly authorized hosted run.

Runtime JSON schema: exactly one property, `database_url`, containing a PostgreSQL URL with explicit username, password, project DNS host, port and database name. No other JSON keys or duplicate keys. Percent-encode credential characters. No fragment. Query parameters must be absent or exactly `sslmode=verify-full`; service, hostaddr, alternate hosts, options and insecure TLS overrides are refused. The URL host must match `--expected-host`; no provider hostname, project ID, admin account or credential is embedded in the script. Use the project connection authorized for backup. Insufficient runtime-role read privileges fail rather than silently switching to an administrator.

Config, CA and key must be effective-user-owned, single-link regular files with exact mode0600. All paths must be absolute and canonical, without symlink components or `..`. The pre-existing dedicated backup directory must be owned mode0700. Ancestors must be root/caller-owned and not group/world writable, except a root-owned sticky ancestor such as `/tmp`. Tools must be real regular executable paths, root/caller-owned and not group/world writable; symlink launchers are refused. Resolve and review the real binary privately. No PATH search, ambient libpq variables or inherited loader configuration is used. If a downloaded client needs private shared libraries, the operator must provide a trusted runnable installation (for example a reviewed RPATH build); inherited `LD_LIBRARY_PATH` is intentionally not supported.

Key format matches local ops: one line of 32–1024 printable non-space characters, with an optional final newline. Generate and escrow adequate random entropy outside this task. Never put keys or URLs in argv, Git, screenshots or logs. A configured trusted CA is required; dry-run checks only file ownership, bounds and PEM marker shape. The actual client validates its certificate chain and hostname with `verify-full`, minimum TLS1.2 and GSS encryption disabled so it cannot bypass TLS verification.

Dry-run performs local validation only: no DNS lookup, connection, tool execution, lock creation, publication or retention. It does not prove database credentials, privileges, server/client version compatibility, certificate validity or even client executability on this host beyond file permissions. Its output is `connected:false`, not a successful hosted backup.

### Bounded behavior and archive contract

- Read-only `pg_dump -w --format=custom --schema=pactra --strict-names --no-blobs --no-owner --no-privileges`; no migration or restore commands. Missing schema, permission errors or non-custom output fail closed. No table inventory certification is claimed.
- Dump stdout remains in bounded memory, not temporary plaintext files. Size limit defaults to64 MiB, allowed1–512 MiB. Peak RSS is multiple times dump size during encryption, not a total-RSS limit.
- Wall timeout defaults to120 seconds per subprocess stage, allowed1–600; dump and encryption each have a separate deadline. Connect timeout10 seconds, statement timeout120 seconds and lock wait5 seconds. Failed/timed-out dump is killed and reaped.
- Core dumps are disabled for the wrapper and children. Key and CA handoff use Linux anonymous memory descriptors; no temporary passphrase file. Parent must separately review swap, crash capture and process isolation: memory-only application I/O is not a guarantee against OS paging or privileged inspection.
- Encryption uses the existing `PACTRA-OPS-1` envelope: salted AES-256-CBC, PBKDF2-SHA256/200000 and a domain-separated HMAC-SHA256 authenticating header/salt/ciphertext. Real OpenSSL roundtrip plus tamper/wrong-key rejection is tested against the existing unseal implementation, replacing only its disk-based key handoff in the test.
- Hosted plaintext payload is the raw PostgreSQL custom dump, matching the prior hosted recipe. It is NOT the ZIP/manifest used by the local-only backup command. Do not pass this archive directly to that tool's `restore` CLI; the parent must authenticate/unseal then separately restore into a reviewed isolated target using a memory/pipe workflow.
- One persistent owned mode0600 `.pactra-hosted-backup.lock` per dedicated directory; nonblocking exclusive flock covers dump, encryption, atomic publication and retention. Do not remove the lock while jobs might run. Different output directories are different lock domains.
- Publication writes ciphertext only to an exclusive private temporary file, fsyncs it, links atomically without overwrite to `daily-YYYYMMDDTHHMMSSZ.dump.enc`, removes the temporary entry and fsyncs the directory. Same-second conflicts fail; no automatic retry or overwrite. Interrupted ciphertext temporary files are not automatically pruned.
- Retention runs only after successful durable publication. Keep newest N eligible archives, always protecting the just-published archive even after clock rollback. Default7, allowed1–90. Exact timestamped `daily-*.dump.enc` names with valid dates, current ownership, mode0600, regular type and single link are eligible. Symlinks, hardlinks, directories, foreign-owned files, other modes, malformed names, `release-*` and abandoned temporary files are untouched. No recursive traversal or mtime-based broad deletion.
- Dedicate this directory to this wrapper's daily namespace. Ownership plus naming is the retention boundary, not cryptographic proof of which program created a same-owner file. Cooperating writers must share its lock; malicious same-user/root actors are outside the threat model. Housekeeping scans at most4096 entries and fails closed above that limit.
- Success logs contain only operation, encrypted status, retention limit and removed count. No connection strings, row data, child stderr, passwords, account names or private paths. A retention failure after publication exits nonzero and explicitly says a backup was published; it does not roll back a valid archive.

## Live deployment and recovery gate — parent/operator only

- [ ] Confirm exact runtime host/project, identity, database, trusted CA, read privileges and supported `pg_dump` version; avoid concurrent DDL/migrations. No admin fallback.
- [ ] Provision reviewed private inputs/dedicated directory, off-host key recovery, storage quota and process memory/swap policy. None was changed by this pass.
- [ ] Run explicit dry-run and inspect its safe result; then separately authorize one real backup and read back the exact published archive's ownership, envelope and authenticated readability privately.
- [ ] Perform an isolated real restore and compare schema, constraints/triggers and appropriate data integrity evidence. Preserve original encrypted archive. Never use a live database as a drill target.
- [ ] Review what `pactra`-only coverage excludes: external schemas, roles/ACLs, extensions, large objects, object storage and other services. A schema dump alone is not complete disaster recovery.
- [ ] Configure scheduler and failure monitoring only after review. Record actual unit/timer status, tested failure alert route and successful scheduled run. No scheduler is provided or installed by this change.
- [ ] Verify live frontend/backend revision and actual public browser/API workflow, correct supplied arbiter configuration and consent, wallet behavior, rate limits and AI availability/cost policy. No public full on-chain flow is claimed yet.
- [ ] Record credential rotation status and coordinate with existing consumers. Do not print credentials or silently invalidate teammates' handoffs.

## Testnet and mainnet gates

For each network, keep a separate evidence record; fields without evidence remain **pending**, never example addresses or transactions.

- [ ] Confirm authoritative RPC, chain ID, native asset/gas requirements and explorer with the network owner.
- [ ] Review final contract source, tests/security limitations, deployed bytecode, constructor parameters and exact real arbiter configuration.
- [ ] Obtain explicit deployment/funding authorization; retain actual deployment receipt and contract address with chain/explorer readback.
- [ ] Execute approved real lifecycle actions and verify successful receipts, events and resulting state; distinguish funding, acceptance, dispute, timeout and withdrawal coverage actually exercised.
- [ ] Verify live UI signing/submission/receipt handling on that exact deployment; rejected and failed transactions must not appear as settled work.
- [ ] Testnet completion alone does not authorize mainnet. Mainnet requires separate owner sign-off, gas/funds controls and its own real evidence.

See [SUBMISSION_PACKAGE.md](SUBMISSION_PACKAGE.md) for publication gates. Prepared files are not a submitted or qualifying entry.
