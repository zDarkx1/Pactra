#!/usr/bin/env python3
"""Local-only operations regression suite; creates only dedicated databases on 5546."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import unittest
import zipfile
from unittest import mock

import sys
sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
LEGACY_TABLES = {'accounts', 'challenge_limits', 'challenges', 'sessions', 'tasks'}
CURRENT_TABLES = LEGACY_TABLES | {
    'task_idempotency', 'delivery_events', 'delivery_idempotency',
    'ai_usage_global', 'ai_usage_wallet',
}


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ops = load('pactra_ops', 'pactra-backup-restore.py')
        cls.cleanup = load('pactra_cleanup', 'pactra-auth-cleanup.py')

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='pactra_ops_unit_')
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def private(self, name, data):
        p = self.dir / name
        p.write_text(data)
        p.chmod(0o600)
        return p

    def config(self, host='/var/run/postgresql', db='pactra_ops_unit', extra=''):
        return self.private('db.env', f'PGHOST={host}\nPGPORT=5546\nPGUSER=root\nPGDATABASE={db}\n' + extra)

    def test_env_requires_exact_mode_regular_owned_file(self):
        p = self.config()
        self.ops.read_config(p, 'source')
        for mode in (0o644, 0o400, 0o660, 0o700):
            p.chmod(mode)
            with self.assertRaises(self.ops.OpsError):
                self.ops.read_config(p, 'source')
        p.chmod(0o600)
        link = self.dir / 'link'
        link.symlink_to(p)
        with self.assertRaises(self.ops.OpsError):
            self.ops.read_config(link, 'source')

    def test_no_host_tricks_or_remote_destinations(self):
        for host in ('localhost', 'localhost.evil', '127.1', '2130706433', '127.0.0.1,evil', '::ffff:127.0.0.1', '[::1]', '::1%lo', '/tmp', '74.249.35.159', '127.0.0.1 hostaddr=8.8.8.8'):
            with self.subTest(host=host), self.assertRaises(self.ops.OpsError):
                self.ops.read_config(self.config(host, 'pactra_restore_unit'), 'target')
        for host in ('127.0.0.1', '::1', '/var/run/postgresql'):
            self.ops.read_config(self.config(host, 'pactra_restore_unit'), 'target')

    def test_database_and_environment_injection_rejected(self):
        for db in ('postgres', 'pactra_restore_', 'pactra_restore_x?host=evil', 'postgresql://evil/db', 'pactra_restore_x\nPGHOSTADDR=8.8.8.8'):
            with self.subTest(db=db), self.assertRaises(self.ops.OpsError):
                self.ops.read_config(self.config(db=db), 'target')
        for extra in ('PGSERVICE=evil\n', 'PGOPTIONS=-c search_path=evil\n', 'PGHOSTADDR=8.8.8.8\n', 'DATABASE_URL=secret\n', 'PGPORT=5432\n', 'PGDATABASE=pactra_ops_again\n'):
            with self.subTest(extra=extra), self.assertRaises(self.ops.OpsError):
                self.ops.read_config(self.config(extra=extra), 'source')
        config = self.ops.read_config(self.config(), 'source')
        old = dict(os.environ)
        try:
            os.environ.update(PGHOSTADDR='8.8.8.8', PGSERVICE='evil', PGPASSWORD='not-a-real-password', LD_PRELOAD='/bad', OPENSSL_CONF='/bad')
            env = self.ops.child_env(config)
            self.assertNotIn('PGHOSTADDR', env)
            self.assertNotIn('PGSERVICE', env)
            self.assertNotIn('PGPASSWORD', env)
            self.assertNotIn('LD_PRELOAD', env)
            self.assertNotIn('OPENSSL_CONF', env)
            self.assertEqual(env['PGHOST'], '/var/run/postgresql')
        finally:
            os.environ.clear()
            os.environ.update(old)

    def test_password_never_in_argv_or_errors(self):
        config = self.ops.read_config(self.config(extra='PGPASSWORD=synthetic-secret-not-live\n'), 'source')
        self.assertEqual(self.ops.child_env(config)['PGPASSWORD'], 'synthetic-secret-not-live')
        with self.assertRaises(self.ops.OpsError) as caught:
            self.ops.run(['/usr/bin/false'], config)
        self.assertNotIn('synthetic-secret', str(caught.exception))
        self.assertNotIn('pactra_ops_unit', str(caught.exception))

    def test_cleanup_bounds_and_retention_validation(self):
        for limit in (0, -1, 1001):
            with self.assertRaises(ValueError):
                self.cleanup.cleanup_sql(limit, 86400, False)
        for retention in (-1, 31536001):
            with self.assertRaises(ValueError):
                self.cleanup.cleanup_sql(1, retention, False)
        sql = self.cleanup.cleanup_sql(1, 86400, True)
        self.assertNotIn('DELETE FROM pactra.tasks', sql)
        self.assertNotIn('DELETE FROM pactra.accounts', sql)
        self.assertIn('SKIP LOCKED', sql)

    def test_openssl_receives_private_file_not_argv_secret(self):
        password = b'synthetic-test-key-not-a-live-secret-123456'
        original = self.ops.run
        observed = []

        def inspect(argv, config, data=None, pass_fds=()):
            self.assertNotIn(password.decode(), ' '.join(argv))
            self.assertEqual(len(pass_fds), 1)
            fd = pass_fds[0]
            self.assertIn(f'fd:{fd}', argv)
            self.assertEqual(os.fstat(fd).st_mode & 0o777, 0o600)
            self.assertEqual(os.pread(fd, 2048, 0), password + b'\n')
            observed.append(True)
            return original(argv, config, data, pass_fds)

        with mock.patch.object(self.ops, 'run', side_effect=inspect):
            blob = self.ops.crypt(b'local test payload', password)
            self.assertEqual(self.ops.crypt(blob, password, decrypt=True), b'local test payload')
        self.assertEqual(len(observed), 2)

    def test_no_overwrite_symlink_and_private_passphrase_validation(self):
        existing = self.private('existing', 'unchanged')
        link = self.dir / 'output.enc'
        link.symlink_to(existing)
        with self.assertRaises(self.ops.OpsError):
            self.ops.publish(link, b'must not overwrite')
        self.assertEqual(existing.read_text(), 'unchanged')
        for value in ('short', 'a' * 32 + '\nsecond-line', 'a' * 31 + ' ', 'a' * 1025):
            with self.subTest(length=len(value)), self.assertRaises(self.ops.OpsError):
                self.ops.passphrase(self.private('bad-pass', value))

    def test_authentication_precedes_database_access(self):
        config = self.ops.read_config(self.config(db='pactra_restore_unit'), 'target')
        archive = self.private('bad.enc', 'not an authenticated backup')
        with mock.patch.object(self.ops, 'check_server') as check:
            with self.assertRaises(self.ops.OpsError):
                self.ops.restore(config, b'a' * 32, archive)
            check.assert_not_called()

    def test_unknown_connection_role_is_rejected(self):
        with self.assertRaises(self.ops.OpsError):
            self.ops.read_config(self.config(), 'anything')

    def test_snapshot_inventory_has_stable_timezone(self):
        config = self.ops.read_config(self.config(), 'source')
        self.assertIn('-c timezone=UTC', self.ops.child_env(config)['PGOPTIONS'])

    def test_only_explicit_legacy_and_current_table_sets_are_supported(self):
        self.assertEqual(set(self.ops.TABLES), CURRENT_TABLES)
        for tables in (LEGACY_TABLES, CURRENT_TABLES):
            self.assertEqual(self.ops.validate_tables(sorted(tables)), tuple(sorted(tables)))
        for tables in (set(), LEGACY_TABLES | {'task_idempotency'},
                       CURRENT_TABLES - {'ai_usage_wallet'},
                       CURRENT_TABLES | {'task_creation_requests'},
                       CURRENT_TABLES | {'unknown_table'}):
            with self.subTest(tables=sorted(tables)), self.assertRaises(self.ops.OpsError):
                self.ops.validate_tables(sorted(tables))

    def test_authenticated_unsupported_manifest_rejected_before_database_access(self):
        config = self.ops.read_config(self.config(db='pactra_restore_unit'), 'target')
        dump = b'PGDMPsynthetic-not-executed'
        metadata = {'format': 1, 'source_database': 'pactra_ops_unit',
                    'source_port': '5546', 'dump_sha256': hashlib.sha256(dump).hexdigest(),
                    'inventory': {'tables': {t: {} for t in CURRENT_TABLES | {'unknown_table'}}}}
        bundle = io.BytesIO()
        with zipfile.ZipFile(bundle, 'w') as z:
            z.writestr('manifest.json', json.dumps(metadata))
            z.writestr('pactra.dump', dump)
        archive = self.dir / 'unsupported.enc'
        self.ops.publish(archive, self.ops.seal(bundle.getvalue(), b'a' * 32))
        with mock.patch.object(self.ops, 'check_server') as check:
            with self.assertRaisesRegex(self.ops.OpsError, 'unsupported schema table set'):
                self.ops.restore(config, b'a' * 32, archive)
            check.assert_not_called()


class LocalDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ops = load('pactra_ops_db', 'pactra-backup-restore.py')
        cls.tmp = tempfile.TemporaryDirectory(prefix='pactra_ops_drill_')
        cls.dir = Path(cls.tmp.name)
        tag = secrets.token_hex(6)
        cls.source = 'pactra_ops_' + tag
        cls.target = 'pactra_restore_' + tag
        cls.env = cls.ops.child_env({'PGHOST': '/var/run/postgresql', 'PGPORT': '5546', 'PGUSER': 'root', 'PGDATABASE': 'postgres'})
        cls.created = []
        cls.addClassCleanup(cls.teardown)
        for db in (cls.source, cls.target):
            cls.query('postgres', f'CREATE DATABASE {db} TEMPLATE template0;')
            cls.created.append(db)
        cls.migrations = sorted((ROOT / 'backend/migrations').glob('*.sql'))
        if [p.name for p in cls.migrations] != [
            '0001_workspace.sql', '0002_task_reliability.sql',
            '0003_delivery_review.sql', '0004_ai_usage.sql',
        ]:
            raise AssertionError('migration set changed; operations review required')
        for migration in cls.migrations:
            cls.query(cls.source, migration.read_text())
        print(f'\nDRILL full schema0001-0004: {cls.source} -> {cls.target} on local5546', flush=True)
        # Deliberately synthetic database fixtures, not users, arbiter configuration,
        # funds, submissions or review evidence. Only verify storage invariants.
        cls.query(cls.source, """
INSERT INTO pactra.accounts SELECT '0x' || lpad(to_hex(n),40,'0') FROM generate_series(1,8) n;
INSERT INTO pactra.sessions SELECT decode(lpad(to_hex(n),64,'0'),'hex'), '0x'||lpad('1',40,'0'), 'synthetic-local-only',
 now() + CASE WHEN n<=3 THEN interval '-3 days' WHEN n=4 THEN interval '-1 hour' ELSE interval '3 days' END FROM generate_series(1,5) n;
INSERT INTO pactra.challenges SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, '0x'||lpad('1',40,'0'), 'SYNTHETIC LOCAL STORAGE FIXTURE',
 now() + CASE WHEN n<=3 THEN interval '-3 days' WHEN n=4 THEN interval '-1 hour' ELSE interval '3 days' END, n=5 FROM generate_series(1,5) n;
INSERT INTO pactra.challenge_limits SELECT '0x'||lpad(to_hex(n),40,'0'),
 now() + CASE WHEN n<=3 THEN interval '-3 days' WHEN n=4 THEN interval '-1 hour' ELSE interval '1 day' END, 1 FROM generate_series(1,5) n;
INSERT INTO pactra.tasks VALUES ('10000000-0000-4000-8000-000000000001', '0x'||lpad('1',40,'0'), '0x'||lpad('2',40,'0'), '0x'||lpad('3',40,'0'), '0x'||lpad('4',40,'0'), 'accepted_unfunded', '{"fixture":"synthetic local storage only"}', '{"fixture":"synthetic local storage only"}', repeat('a',64), now(), now()+interval '1 day', now()+interval '2 days');
INSERT INTO pactra.task_idempotency(buyer,key,request_hash,task_id,response_status,response_body)
SELECT buyer,'20000000-0000-4000-8000-000000000001',decode(repeat('b',64),'hex'),id,201,
 convert_to('{"fixture":"synthetic creation response"}','UTF8') FROM pactra.tasks;
INSERT INTO pactra.delivery_events(task_id,deliverable_id,kind,version,actor,artifact_hash,manifest_hash,event_json)
SELECT id,'synthetic-deliverable',kind,1,worker,repeat('c',64),manifest_hash,
 '{"fixture":"synthetic storage only, not review evidence"}' FROM pactra.tasks
 CROSS JOIN (VALUES ('submission'),('review'),('dispute')) k(kind);
INSERT INTO pactra.delivery_idempotency(task_id,deliverable_id,operation,actor,idempotency_key,canonical_payload,response_json)
SELECT id,'synthetic-deliverable',operation,worker,'30000000-0000-4000-8000-000000000001',
 '{"fixture":"synthetic payload"}','{"fixture":"synthetic response"}' FROM pactra.tasks
 CROSS JOIN (VALUES ('submissions'),('reviews'),('disputes')) k(operation);
INSERT INTO pactra.ai_usage_global(usage_day,count) VALUES ('2026-01-01',1000),('2026-01-02',7);
INSERT INTO pactra.ai_usage_wallet(usage_day,address,count)
SELECT '2026-01-01',address,100 FROM pactra.accounts;
CREATE SCHEMA outside_pactra;
CREATE TABLE outside_pactra.must_not_copy(n integer);
INSERT INTO outside_pactra.must_not_copy VALUES(7);
""")
        for label, db in (('source', cls.source), ('target', cls.target)):
            p = cls.dir / (label + '.env')
            p.write_text(f'PGHOST=/var/run/postgresql\nPGPORT=5546\nPGUSER=root\nPGDATABASE={db}\n')
            p.chmod(0o600)
        cls.passfile = cls.dir / 'passphrase'
        cls.passfile.write_text(secrets.token_hex(32) + '\n')
        cls.passfile.chmod(0o600)

    @classmethod
    def teardown(cls):
        for db in reversed(cls.created):
            cls.query('postgres', f'DROP DATABASE {db};')
            if cls.query('postgres', f"SELECT count(*) FROM pg_database WHERE datname='{db}';").stdout.strip() != '0':
                raise AssertionError('dedicated database removal was not verified')
            print(f'DRILL removal verified: {db}', flush=True)
        cls.tmp.cleanup()

    @classmethod
    def query(cls, db, sql, check=True):
        env = dict(cls.env, PGDATABASE=db)
        p = subprocess.run(['/usr/bin/psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True, env=env, timeout=60)
        if check and p.returncode:
            raise AssertionError('local fixture SQL failed: ' + p.stderr)
        return p

    def cli(self, script, *args, ok=True, env=None):
        p = subprocess.run(['/usr/bin/python3', str(HERE / script), *map(str, args)], text=True, capture_output=True, env=env, timeout=90)
        if ok:
            self.assertEqual(p.returncode, 0, p.stderr)
        else:
            self.assertNotEqual(p.returncode, 0)
        return p

    def backup(self, filename):
        return self.cli('pactra-backup-restore.py', 'backup', '--source-env', self.dir / 'source.env', '--passphrase-file', self.passfile, '--output', self.dir / filename)

    def restore(self, filename, ok=True, env=None):
        return self.cli('pactra-backup-restore.py', 'restore', '--target-env', self.dir / 'target.env', '--passphrase-file', self.passfile, '--input', self.dir / filename, ok=ok, env=env)

    def test_01_encrypted_restore_exact_rows_schema_constraints_and_no_overwrite(self):
        before = self.ops.inventory(self.ops.read_config(self.dir / 'source.env', 'source'))
        self.assertEqual(set(before['tables']), CURRENT_TABLES)
        expected_counts = {'accounts': 8, 'sessions': 5, 'challenges': 5,
                           'challenge_limits': 5, 'tasks': 1, 'task_idempotency': 1,
                           'delivery_events': 3, 'delivery_idempotency': 3,
                           'ai_usage_global': 2, 'ai_usage_wallet': 8}
        self.assertEqual(json.loads(self.backup('good.enc').stdout)['tables'], expected_counts)
        schema = before['schema']
        self.assertEqual({f['name'] for f in schema['functions']},
                         {'guard_task_update', 'guard_delivery_history'})
        self.assertEqual({t['tgname'] for t in schema['triggers']}, {
            'immutable_task', 'delivery_events_immutable', 'delivery_events_no_truncate',
            'delivery_idempotency_immutable', 'delivery_idempotency_no_truncate'})
        self.assertTrue({'tasks_buyer_page', 'tasks_worker_page', 'delivery_one_dispute',
                         'challenge_limits_window_start_idx'} <=
                        {i['indexname'] for i in schema['indexes']})
        blob = (self.dir / 'good.enc').read_bytes()
        self.assertNotIn(b'SYNTHETIC LOCAL STORAGE', blob)
        self.assertNotIn(b'PGDMP', blob)
        self.assertEqual((self.dir / 'good.enc').stat().st_mode & 0o777, 0o600)
        original = hashlib.sha256(blob).digest()
        self.cli('pactra-backup-restore.py', 'backup', '--source-env', self.dir / 'source.env', '--passphrase-file', self.passfile, '--output', self.dir / 'good.enc', ok=False)
        self.assertEqual(original, hashlib.sha256((self.dir / 'good.enc').read_bytes()).digest())
        # Ambient libpq/service/loader settings must have no effect on the drill.
        env = dict(os.environ, PGHOSTADDR='203.0.113.99', PGSERVICE='hostile', PGDATABASE='postgres', PGPORT='5432', PGPASSFILE='/not/read', PGOPTIONS='-c search_path=outside_pactra')
        p = self.restore('good.enc', env=env)
        self.assertTrue(json.loads(p.stdout)['verified'])
        self.assertEqual(json.loads(p.stdout)['tables'], expected_counts)
        after = self.ops.inventory(self.ops.read_config(self.dir / 'target.env', 'target'))
        self.assertEqual(before, after)
        self.assertEqual(self.query(self.target, "SELECT to_regclass('outside_pactra.must_not_copy') IS NULL;").stdout.strip(), 't')
        self.assertEqual(self.query(self.target, 'SELECT status FROM pactra.tasks;').stdout.strip(), 'accepted_unfunded')
        for sql in ("UPDATE pactra.tasks SET status='cancelled';", "UPDATE pactra.tasks SET manifest_hash=repeat('b',64);", "INSERT INTO pactra.accounts VALUES('invalid');", "UPDATE pactra.sessions SET token_hash=decode('aa','hex');", "UPDATE pactra.challenges SET address='0x'||repeat('f',40);", "UPDATE pactra.challenge_limits SET count=6;"):
            with self.subTest(sql=sql):
                self.assertNotEqual(self.query(self.target, sql, check=False).returncode, 0)
        for table in ('delivery_events', 'delivery_idempotency'):
            for statement in (f'UPDATE pactra.{table} SET actor=actor;',
                              f'DELETE FROM pactra.{table};', f'TRUNCATE pactra.{table};'):
                with self.subTest(statement=statement):
                    rejected = self.query(self.target, statement, check=False)
                    self.assertNotEqual(rejected.returncode, 0)
                    self.assertIn('immutable delivery history', rejected.stderr)
        for table, maximum in (('ai_usage_global', 1000), ('ai_usage_wallet', 100)):
            for count in (0, maximum + 1):
                with self.subTest(table=table, count=count):
                    rejected = self.query(self.target, f'UPDATE pactra.{table} SET count={count};', check=False)
                    self.assertNotEqual(rejected.returncode, 0)
                    self.assertIn('check constraint', rejected.stderr)
            # Counters are mutable within limits, unlike delivery history. Roll
            # back this successful exercise to preserve the exact restore.
            self.assertEqual(self.query(self.target,
                f'BEGIN; UPDATE pactra.{table} SET count=1; '
                f'SELECT bool_and(count=1) FROM pactra.{table}; ROLLBACK;').stdout.strip(), 't')
        for statement, error in (
            ("INSERT INTO pactra.delivery_events SELECT task_id,deliverable_id,kind,2,actor,artifact_hash,manifest_hash,event_json FROM pactra.delivery_events WHERE kind='dispute';", 'delivery_one_dispute'),
            ("INSERT INTO pactra.delivery_idempotency SELECT * FROM pactra.delivery_idempotency;", 'duplicate key'),
            ("UPDATE pactra.task_idempotency SET response_status=200;", 'check constraint'),
            ("UPDATE pactra.task_idempotency SET request_hash=decode('aa','hex');", 'check constraint'),
            ("UPDATE pactra.task_idempotency SET task_id='10000000-0000-4000-8000-000000000099';", 'foreign key'),
            ("UPDATE pactra.ai_usage_wallet SET address='0x'||repeat('f',40) WHERE address='0x'||lpad('1',40,'0');", 'foreign key'),
        ):
            with self.subTest(statement=statement):
                rejected = self.query(self.target, statement, check=False)
                self.assertNotEqual(rejected.returncode, 0)
                self.assertIn(error, rejected.stderr)
        self.restore('good.enc', ok=False)
        self.assertEqual(after, self.ops.inventory(self.ops.read_config(self.dir / 'target.env', 'target')))
        print('\nDRILL full encrypted restore verified: ' + json.dumps(expected_counts, sort_keys=True), flush=True)

    def test_02_tampered_wrong_key_truncated_and_same_target_fail_closed(self):
        self.backup('auth.enc')
        blob = bytearray((self.dir / 'auth.enc').read_bytes())
        blob[-40] ^= 1
        p = self.dir / 'tampered.enc'
        p.write_bytes(blob)
        p.chmod(0o600)
        result = self.restore('tampered.enc', ok=False)
        self.assertIn('authentication', result.stderr)
        p.write_bytes(blob[:80])
        self.restore('tampered.enc', ok=False)
        wrong = self.dir / 'wrong-pass'
        wrong.write_text('synthetic-wrong-key-not-live-0123456789\n')
        wrong.chmod(0o600)
        result = self.cli('pactra-backup-restore.py', 'restore', '--target-env', self.dir / 'target.env', '--passphrase-file', wrong, '--input', self.dir / 'auth.enc', ok=False)
        self.assertIn('authentication', result.stderr)
        self.cli('pactra-backup-restore.py', 'restore', '--target-env', self.dir / 'source.env', '--passphrase-file', self.passfile, '--input', self.dir / 'auth.enc', ok=False)

    def test_03_cleanup_dry_run_bounded_retention_and_immutable_data(self):
        config = self.ops.read_config(self.dir / 'source.env', 'source')
        before = self.ops.inventory(config)
        args = ('--env-file', self.dir / 'source.env', '--batch-size', '2', '--retention-seconds', '86400')
        p = self.cli('pactra-auth-cleanup.py', *args)
        report = json.loads(p.stdout)
        self.assertEqual(report['mode'], 'dry-run')
        self.assertEqual(report['counts'], {'sessions': 2, 'challenges': 2, 'challenge_limits': 2})
        self.assertEqual(before, self.ops.inventory(config))
        p = self.cli('pactra-auth-cleanup.py', *args, '--delete')
        self.assertEqual(json.loads(p.stdout)['counts'], report['counts'])
        p = self.cli('pactra-auth-cleanup.py', *args, '--delete')
        self.assertEqual(json.loads(p.stdout)['counts'], {'sessions': 1, 'challenges': 1, 'challenge_limits': 1})
        p = self.cli('pactra-auth-cleanup.py', *args, '--delete')
        self.assertEqual(json.loads(p.stdout)['counts'], {'sessions': 0, 'challenges': 0, 'challenge_limits': 0})
        after = self.ops.inventory(config)
        self.assertEqual(before['schema'], after['schema'])
        for table in CURRENT_TABLES - {'sessions', 'challenges', 'challenge_limits'}:
            self.assertEqual(before['tables'][table], after['tables'][table])
        for table in ('sessions', 'challenges', 'challenge_limits'):
            self.assertEqual(after['tables'][table]['count'], 2)
        self.assertEqual(self.query(self.source, 'SELECT consumed FROM pactra.challenges ORDER BY expires_at DESC LIMIT 1;').stdout.strip(), 't')

    def test_04_unknown_tables_fail_closed_for_backup_and_cleanup(self):
        config = self.ops.read_config(self.dir / 'source.env', 'source')
        before = self.ops.inventory(config)
        self.query(self.source, 'CREATE TABLE pactra.unknown_ops_fixture(n integer);')
        try:
            result = self.cli('pactra-backup-restore.py', 'backup', '--source-env',
                              self.dir / 'source.env', '--passphrase-file', self.passfile,
                              '--output', self.dir / 'unknown.enc', ok=False)
            self.assertIn('unsupported schema table set', result.stderr)
            self.assertFalse((self.dir / 'unknown.enc').exists())
            self.cli('pactra-auth-cleanup.py', '--env-file', self.dir / 'source.env',
                     '--retention-seconds', '0', '--delete', ok=False)
        finally:
            self.query(self.source, 'DROP TABLE pactra.unknown_ops_fixture;')
        self.assertEqual(before, self.ops.inventory(config))

    def test_05_legacy_restore_and_intermediate_schema_rejection(self):
        tag = secrets.token_hex(6)
        source, target = 'pactra_ops_' + tag, 'pactra_restore_' + tag
        for db in (source, target):
            self.query('postgres', f'CREATE DATABASE {db} TEMPLATE template0;')
            self.created.append(db)
        config = {k: self.env[k] for k in ('PGHOST', 'PGPORT', 'PGUSER')}
        source_config, target_config = dict(config, PGDATABASE=source), dict(config, PGDATABASE=target)
        self.query(source, self.migrations[0].read_text())
        self.query(source, "INSERT INTO pactra.accounts VALUES ('0x'||lpad('1',40,'0'));")
        before = self.ops.inventory(source_config)
        self.assertEqual(set(before['tables']), LEGACY_TABLES)
        key = self.ops.passphrase(self.passfile)
        archive = self.dir / 'legacy.enc'
        self.ops.backup(source_config, key, archive)
        self.assertTrue(self.ops.restore(target_config, key, archive)['verified'])
        self.assertEqual(before, self.ops.inventory(target_config))
        legacy_env = self.dir / 'legacy.env'
        legacy_env.write_text('\n'.join(f'{k}={v}' for k, v in source_config.items()) + '\n')
        legacy_env.chmod(0o600)
        self.assertEqual(json.loads(self.cli('pactra-auth-cleanup.py', '--env-file', legacy_env).stdout)['counts'],
                         {'sessions': 0, 'challenges': 0, 'challenge_limits': 0})
        self.assertEqual(before, self.ops.inventory(source_config))
        print(f'\nDRILL legacy0001 encrypted restore verified: {source} -> {target}', flush=True)
        for migration in self.migrations[1:3]:
            self.query(source, migration.read_text())
            with self.subTest(migration=migration.name), self.assertRaisesRegex(
                    self.ops.OpsError, 'unsupported schema table set'):
                self.ops.backup(source_config, key, self.dir / 'partial.enc')
            self.assertFalse((self.dir / 'partial.enc').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
