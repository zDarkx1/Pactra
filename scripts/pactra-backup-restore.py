#!/usr/bin/env python3
"""Fail-closed local Pactra backup/isolated restore. No hosted connections supported."""
import argparse
import contextlib
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tempfile
import zipfile

MAGIC = b'PACTRA-OPS-1\n'
ITERATIONS = 200000
LEGACY_TABLES = ('accounts', 'challenge_limits', 'challenges', 'sessions', 'tasks')
# Exact names from migrations 0001-0004; 0002 creates task_idempotency.
# No subset/superset fallback: intermediate or unknown schemas need review.
TABLES = ('accounts', 'ai_usage_global', 'ai_usage_wallet', 'challenge_limits',
          'challenges', 'delivery_events', 'delivery_idempotency', 'sessions',
          'task_idempotency', 'tasks')
SUPPORTED_TABLE_SETS = (LEGACY_TABLES, TABLES)
TABLE_QUERY = "SELECT coalesce(jsonb_agg(tablename ORDER BY tablename),'[]'::jsonb) FROM pg_tables WHERE schemaname='pactra';"


class OpsError(Exception):
    pass


def private_bytes(path):
    """Open once without following final symlinks; check owner/mode on descriptor."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as f:
            info = os.fstat(f.fileno())
            if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.geteuid() or info.st_nlink != 1:
                raise OpsError('input must be an owned regular single-link mode0600 file')
            return f.read()
    except OSError:
        raise OpsError('cannot read private input') from None


def read_config(path, role):
    if role not in ('source', 'target'):
        raise OpsError('invalid connection role')
    try:
        text = private_bytes(path).decode('utf-8')
    except UnicodeError:
        raise OpsError('invalid configuration encoding') from None
    config = {}
    allowed = {'PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSWORD'}
    for line in text.splitlines():
        if not line or line.startswith('#'):
            continue
        key, sep, value = line.partition('=')
        if not sep or key not in allowed or key in config or not value or any(ord(c) < 32 for c in value):
            raise OpsError('invalid configuration fields')
        config[key] = value
    if not {'PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE'} <= config.keys():
        raise OpsError('missing explicit connection fields')
    # No DNS, alternate sockets, URI/conninfo dbnames, comma hosts or hostaddr.
    if config['PGHOST'] not in ('/var/run/postgresql', '127.0.0.1', '::1') or config['PGPORT'] != '5546' or config['PGUSER'] != 'root':
        raise OpsError('only explicit local root cluster5546 connections are allowed')
    prefix = 'pactra_restore_' if role == 'target' else 'pactra_ops_'
    if not re.fullmatch(prefix + r'[a-z0-9_]{1,40}', config['PGDATABASE']):
        raise OpsError('database outside dedicated local namespace')
    return config


def child_env(config):
    # Deliberate allowlist, not os.environ.copy(): libpq service, hostaddr, options,
    # .pgpass, .psqlrc and dynamic-loader/OpenSSL config overrides cannot leak in.
    return {'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent', 'LC_ALL': 'C',
            'PGPASSFILE': '/dev/null', 'PGCONNECT_TIMEOUT': '5',
            'PGSSLMODE': 'disable', 'PGGSSENCMODE': 'disable',
            'PGOPTIONS': '-c statement_timeout=60000 -c lock_timeout=5000 -c timezone=UTC',
            **config}


def run(argv, config, data=None, pass_fds=()):
    try:
        result = subprocess.run(argv, input=data, capture_output=True, env=child_env(config), timeout=120, pass_fds=pass_fds)
    except (OSError, subprocess.TimeoutExpired):
        raise OpsError('local operation failed or timed out; details suppressed') from None
    if result.returncode:
        raise OpsError('local operation failed; details suppressed')
    return result.stdout


def sql(config, statement):
    return run(['/usr/bin/psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1'], config, statement.encode()).decode().strip()


def check_server(config):
    expected = config['PGDATABASE']
    value = json.loads(sql(config, "SELECT json_build_object('db',current_database(),'user',current_user,'port',current_setting('port'),'addr',inet_server_addr());"))
    if value['db'] != expected or value['user'] != 'root' or value['port'] != '5546' or value['addr'] not in (None, '127.0.0.1', '::1'):
        raise OpsError('unexpected local server identity')


@contextlib.contextmanager
def snapshot(config):
    """Keep a read-only exported snapshot alive across inventory and pg_dump."""
    p = subprocess.Popen(['/usr/bin/psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=child_env(config), text=True)
    try:
        assert p.stdin is not None and p.stdout is not None
        p.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL idle_in_transaction_session_timeout='180s';\nSELECT pg_export_snapshot();\n")
        p.stdin.flush()
        import select
        if not select.select([p.stdout], [], [], 10)[0]:
            raise OpsError('snapshot timed out')
        token = p.stdout.readline().strip()
        if not re.fullmatch(r'[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+', token):
            raise OpsError('snapshot unavailable')
        yield token
    finally:
        p.kill()
        p.communicate()


def validate_tables(tables):
    if not isinstance(tables, (list, tuple)) or any(not isinstance(t, str) for t in tables):
        raise OpsError('unsupported schema table set; migration review required')
    ordered = tuple(sorted(tables))
    if ordered not in SUPPORTED_TABLE_SETS:
        raise OpsError('unsupported schema table set; migration review required')
    return ordered


def snapshot_begin(snapshot_id=None):
    begin = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
    if snapshot_id:
        if not re.fullmatch(r'[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+', snapshot_id):
            raise OpsError('invalid snapshot')
        begin += f"SET TRANSACTION SNAPSHOT '{snapshot_id}';\n"
    return begin


def supported_tables(config, snapshot_id=None):
    return validate_tables(json.loads(sql(config, snapshot_begin(snapshot_id) + TABLE_QUERY + '\nCOMMIT;')))


def inventory(config, snapshot_id=None):
    # Discovery, row hashes, definitions and dump must see the same snapshot.
    if snapshot_id is None:
        with snapshot(config) as snap:
            return inventory(config, snap)
    tables = supported_tables(config, snapshot_id)
    begin = snapshot_begin(snapshot_id)
    # Read rows in deterministic order and hash locally. Never print auth data.
    queries = [TABLE_QUERY]
    for table in tables:
        queries.append(f'SELECT coalesce(jsonb_agg(r ORDER BY r::text),\'[]\'::jsonb) FROM (SELECT row_to_json(t)::jsonb r FROM pactra.{table} t) s;')
    queries.append("""SELECT json_build_object(
'columns',(SELECT jsonb_agg(x ORDER BY table_name,ordinal_position) FROM (SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='pactra') x),
'constraints',(SELECT jsonb_agg(x ORDER BY rel,conname) FROM (SELECT c.relname rel,conname,pg_get_constraintdef(k.oid) def FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pactra') x),
'indexes',(SELECT jsonb_agg(x ORDER BY indexname) FROM (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='pactra') x),
'functions',(SELECT jsonb_agg(x ORDER BY name) FROM (SELECT p.proname name,pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pactra') x),
 'triggers',(SELECT jsonb_agg(x ORDER BY tgname) FROM (SELECT t.tgname,pg_get_triggerdef(t.oid) def FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pactra' AND NOT t.tgisinternal) x));""")
    lines = sql(config, begin + '\n'.join(queries) + '\nCOMMIT;').splitlines()
    values = [json.loads(line) for line in lines]
    if values[0] != list(tables) or len(values) != len(tables) + 2:
        raise OpsError('unsupported schema table set; migration review required')
    result = {'tables': {}, 'schema': values[-1]}
    for table, rows in zip(tables, values[1:-1]):
        canonical = json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()
        result['tables'][table] = {'count': len(rows), 'sha256': hashlib.sha256(canonical).hexdigest()}
    return result


def passphrase(path):
    value = private_bytes(path)
    if not re.fullmatch(rb'[\x21-\x7e]{32,1024}\n?', value):
        raise OpsError('passphrase file requires one 32-1024 character printable non-space line')
    return value.rstrip(b'\n')


def crypt(data, password, decrypt=False):
    # OpenSSL reads a freshly created private file descriptor; no secret in argv.
    with tempfile.TemporaryDirectory(prefix='pactra_ops_crypto_') as directory:
        path = Path(directory) / 'passphrase'
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
        try:
            os.write(fd, password + b'\n')
            os.lseek(fd, 0, os.SEEK_SET)
            argv = ['/usr/bin/openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', str(ITERATIONS), '-md', 'sha256', '-pass', f'fd:{fd}']
            if decrypt:
                argv.append('-d')
            return run(argv, {}, data, pass_fds=(fd,))
        finally:
            os.close(fd)


def seal(data, password):
    salt = secrets.token_bytes(32)
    body = MAGIC + salt + crypt(data, password)
    key = hashlib.pbkdf2_hmac('sha256', password, b'pactra-ops-mac-v1:' + salt, ITERATIONS)
    return body + hmac.digest(key, body, 'sha256')


def unseal(blob, password):
    if not blob.startswith(MAGIC) or len(blob) < len(MAGIC) + 32 + 32 + 32:
        raise OpsError('archive authentication failed')
    salt = blob[len(MAGIC):len(MAGIC) + 32]
    key = hashlib.pbkdf2_hmac('sha256', password, b'pactra-ops-mac-v1:' + salt, ITERATIONS)
    if not hmac.compare_digest(hmac.digest(key, blob[:-32], 'sha256'), blob[-32:]):
        raise OpsError('archive authentication failed')
    return crypt(blob[len(MAGIC) + 32:-32], password, decrypt=True)


def publish(path, data):
    path = Path(path)
    # Same-filesystem hard link publishes atomically and cannot replace any entry,
    # including a symlink. Incomplete writes are never published as a backup.
    with tempfile.TemporaryDirectory(prefix='.pactra_ops_', dir=path.parent) as directory:
        tmp = Path(directory) / 'encrypted'
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        try:
            os.link(tmp, path)
        except OSError:
            raise OpsError('output exists or cannot be published; no overwrite') from None


def backup(config, password, output):
    if os.path.lexists(output):
        raise OpsError('output exists; no overwrite')
    check_server(config)
    with snapshot(config) as snap:
        evidence = inventory(config, snap)
        dump = run(['/usr/bin/pg_dump', '-w', '--format=custom', '--schema=pactra', '--no-owner', '--no-privileges', '--snapshot=' + snap], config)
    metadata = {'format': 1, 'source_database': config['PGDATABASE'], 'source_port': config['PGPORT'], 'dump_sha256': hashlib.sha256(dump).hexdigest(), 'inventory': evidence}
    bundle = io.BytesIO()
    with zipfile.ZipFile(bundle, 'w', compression=zipfile.ZIP_STORED) as z:
        z.writestr('manifest.json', json.dumps(metadata, sort_keys=True))
        z.writestr('pactra.dump', dump)
    publish(output, seal(bundle.getvalue(), password))
    return {'operation': 'backup', 'encrypted': True, 'tables': {k: v['count'] for k, v in evidence['tables'].items()}}


def restore(config, password, archive):
    plaintext = unseal(private_bytes(archive), password)
    try:
        with zipfile.ZipFile(io.BytesIO(plaintext)) as z:
            if sorted(z.namelist()) != ['manifest.json', 'pactra.dump']:
                raise OpsError('unexpected archive members')
            metadata = json.loads(z.read('manifest.json'))
            dump = z.read('pactra.dump')
    except (ValueError, KeyError, zipfile.BadZipFile):
        raise OpsError('invalid authenticated archive') from None
    if metadata.get('format') != 1 or not re.fullmatch(r'pactra_ops_[a-z0-9_]{1,40}', metadata.get('source_database', '')) or metadata.get('source_port') != '5546':
        raise OpsError('invalid source provenance')
    if metadata['source_database'] == config['PGDATABASE']:
        raise OpsError('source and destination must differ')
    if not dump.startswith(b'PGDMP') or hashlib.sha256(dump).hexdigest() != metadata.get('dump_sha256'):
        raise OpsError('dump integrity mismatch')
    evidence = metadata.get('inventory')
    if not isinstance(evidence, dict) or not isinstance(evidence.get('tables'), dict):
        raise OpsError('invalid archive inventory')
    validate_tables(list(evidence['tables']))
    check_server(config)
    # Refuse even an existing empty pactra schema; no --clean or --create.
    empty = sql(config, """SELECT NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema'))
AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
AND NOT EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')
AND NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql');""")
    if empty != 't':
        raise OpsError('restore requires an empty isolated database; no overwrite')
    # Database must be exclusively reserved by operator. pg_restore is atomic;
    # conflicting concurrent creation fails instead of replacing existing objects.
    run(['/usr/bin/pg_restore', '-w', '--dbname=' + config['PGDATABASE'], '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges'], config, dump)
    actual = inventory(config)
    if actual != metadata['inventory']:
        raise OpsError('restore verification mismatch; retain isolated target for investigation')
    return {'operation': 'restore', 'verified': True, 'tables': {k: v['count'] for k, v in actual['tables'].items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='operation', required=True)
    b = subs.add_parser('backup')
    b.add_argument('--source-env', required=True)
    b.add_argument('--output', required=True)
    r = subs.add_parser('restore')
    r.add_argument('--target-env', required=True)
    r.add_argument('--input', required=True)
    for sub in (b, r):
        sub.add_argument('--passphrase-file', required=True)
    args = parser.parse_args()
    try:
        config = read_config(args.source_env if args.operation == 'backup' else args.target_env, 'source' if args.operation == 'backup' else 'target')
        password = passphrase(args.passphrase_file)
        result = backup(config, password, args.output) if args.operation == 'backup' else restore(config, password, args.input)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OpsError, OSError, ValueError):
        # Never print exception payloads from dependencies (may include SQL/DSNs).
        error = sys.exc_info()[1]
        print(str(error) if isinstance(error, OpsError) else 'operation failed; details suppressed', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
