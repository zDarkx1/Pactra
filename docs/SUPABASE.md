# Supabase deployment record

- Application: Pactra; hosted project ID: `ncnuvnbqcaqwawujltiu`. Hosted display-name changes are not verified by this repo rename.
- Organization: Allevi.dev
- Region: Singapore (`ap-southeast-1`)
- Organization plan: Free, verified by Management API after creation. No paid add-ons or upgrade enabled.
- Separate from TerasKayuManis. No café migration, credential or runtime is reused.
- Database: managed PostgreSQL17. Runtime connection uses session pooler port5432 and sslmode=verify-full with trusted Supabase CA.
- Dedicated role: existing provisioned runtime role, no superuser/create-role/create-db/bypass-RLS, connection limit8, statement timeout5seconds and idle-in-transaction timeout10seconds. `pactra_runtime` is the new naming target, not a claim that the hosted role has been renamed.
- Server SSL enforcement enabled and read back via Management API.

## Credential boundaries
Actual values are only in private files outside version control on the development host. The database administrator password and Management API token are for provisioning/migrations only. Neither belongs in the Go runtime or Next frontend. The runtime uses its own password. Do not include secrets when sharing docs, logs, SQL errors, connection URIs or screenshots.

The Management API token shared in chat should be revoked/replaced after provisioning. Prefer scoped project access. Token possession is not authorization to change unrelated projects, organization billing or membership.

## Migrations
Run schema migrations through an admin connection with backups/change review; do not auto-migrate on every API startup. Apply the checked-in SQL to this exact project only. The API checks migration presence at startup and uses a runtime role afterward. New installs use schema pactra; no anonymous Data API policy is added. Existing hosted installs require the explicit [rename cutover](RENAMING.md); no hosted migration was run in this rename pass.

## Operational limitations
Free tier is not a promise of unlimited storage, availability or backup retention. Do not rely on PITR or paid backup features here. Export and restore-test the app schema before real user data or money. Production deployment, alerting, rotation automation and restore drills remain separate gates.
