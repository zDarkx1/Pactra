#!/usr/bin/env python3
"""Offline hosted-wrapper tests: synthetic dump producer, real OpenSSL, no DB."""
import argparse
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ops = load('hosted_ops', 'pactra-hosted-backup.py')
local = load('local_ops', 'pactra-backup-restore.py')


class HostedBackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pactra-hosted-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / 'backups'
        self.output.mkdir(mode=0o700)
        self.config = self.private('runtime.json', json.dumps({
            'database_url': 'postgresql://runtime.project:fixture%40password@db.project.invalid:5432/postgres?sslmode=verify-full'}).encode())
        self.key = self.private('key', b'fixture-only-not-a-real-secret-' + b'x' * 32)
        # Deliberately not a real certificate; dry-run checks shape, not TLS.
        self.ca = self.private('ca.pem', b'-----BEGIN CERTIFICATE-----\nOFFLINE FIXTURE\n-----END CERTIFICATE-----\n')
        self.tool = self.script('dump', 'import os\nos.write(1, b"PGDMP-offline-fixture")\n')
        self.args = argparse.Namespace(runtime_config=str(self.config), expected_host='db.project.invalid',
            schema='pactra', ssl_root_cert=str(self.ca), key_file=str(self.key),
            backup_dir=str(self.output), pg_dump=str(self.tool), openssl='/usr/bin/openssl',
            retain_count=2, timeout_seconds=2, max_dump_mib=1, dry_run=False)

    def private(self, name, data):
        path = self.root / name
        path.write_bytes(data)
        path.chmod(0o600)
        return path

    def script(self, name, body):
        path = self.private(name, ('#!/usr/bin/python3\n' + body).encode())
        path.chmod(0o700)
        return path

    def archive(self, stamp, data=b'old encrypted fixture'):
        return self.private('backups/daily-' + stamp + '.dump.enc', data)

    def test_valid_config_and_environment_allowlist(self):
        config = ops.read_config(str(self.config), self.args.expected_host)
        self.assertEqual(config['PGPASSWORD'], 'fixture@password')
        with mock.patch.dict(os.environ, {'PGHOSTADDR': 'malicious', 'PGSERVICE': 'malicious',
                                          'LD_PRELOAD': 'malicious', 'OPENSSL_CONF': 'malicious'}):
            env = ops.environment(config, 17)
        self.assertEqual(env['PGSSLMODE'], 'verify-full')
        self.assertEqual(env['PGSSLMINPROTOCOLVERSION'], 'TLSv1.2')
        self.assertEqual(env['PGSSLROOTCERT'], '/proc/self/fd/17')
        for field in ('PGHOSTADDR', 'PGSERVICE', 'LD_PRELOAD', 'OPENSSL_CONF', 'LD_LIBRARY_PATH'):
            self.assertNotIn(field, env)

    def test_config_rejects_missing_unknown_duplicate_fields(self):
        for raw in (b'{}', b'[]', b'{"database_url":"x","other":1}',
                    b'{"database_url":"x","database_url":"y"}', b'{"database_url":null}', b'\xff'):
            with self.subTest(raw=raw):
                self.config.write_bytes(raw)
                with self.assertRaises(ops.OpsError):
                    ops.read_config(str(self.config), self.args.expected_host)

    def test_config_rejects_connection_injection_and_implicit_fields(self):
        urls = [
            'postgresql://u:p@other.invalid:5432/postgres',
            'postgresql://u:p@db.project.invalid/postgres',
            'postgresql://u@db.project.invalid:5432/postgres',
            'postgresql://u:p@db.project.invalid:5432/',
            'postgresql://u:p@db.project.invalid:0/postgres',
            'postgresql://u:p@db.project.invalid:99999/postgres',
            'postgresql://u:p@db.project.invalid:5432/host%3Devil',
            'postgresql://u:p@db.project.invalid:5432/postgres?sslmode=require',
            'postgresql://u:p@db.project.invalid:5432/postgres?hostaddr=127.0.0.1',
            'postgresql://u:p@db.project.invalid:5432/postgres?sslmode=verify-full&sslmode=verify-full',
            'postgresql://u:p@db.project.invalid:5432/postgres#fragment',
            'postgresql://u:p%0a@db.project.invalid:5432/postgres',
            'postgresql://u:p%ZZ@db.project.invalid:5432/postgres',
            'postgresql://u:p@db.project.invalid:5432/post\ngres',
        ]
        for url in urls:
            with self.subTest(url=url):
                self.config.write_text(json.dumps({'database_url': url}))
                with self.assertRaises(ops.OpsError):
                    ops.read_config(str(self.config), self.args.expected_host)
        for host in ('localhost', '/tmp', 'a,b.invalid', '-bad.invalid', 'a..invalid'):
            with self.assertRaises(ops.OpsError):
                ops.read_config(str(self.config), host)

    def test_inputs_reject_modes_hardlinks_symlinks_fifo_size(self):
        self.key.chmod(0o644)
        with self.assertRaises(ops.OpsError):
            ops.private_bytes(str(self.key))
        self.key.chmod(0o600)
        os.link(self.key, self.root / 'hardlink')
        with self.assertRaises(ops.OpsError):
            ops.private_bytes(str(self.key))
        (self.root / 'hardlink').unlink()
        (self.root / 'link').symlink_to(self.key)
        with self.assertRaises(OSError):
            ops.private_bytes(str(self.root / 'link'))
        os.mkfifo(self.root / 'fifo', 0o600)
        with self.assertRaises(ops.OpsError):
            ops.private_bytes(str(self.root / 'fifo'))
        with self.assertRaises(ops.OpsError):
            ops.private_bytes(str(self.key), 2)

    def test_wrong_owner_rejected_without_chown(self):
        with mock.patch.object(ops.os, 'geteuid', return_value=os.geteuid() + 1):
            with self.assertRaises(ops.OpsError):
                ops.private_bytes(str(self.key))

    def test_path_guard_ancestors_output_and_tools(self):
        for path in ('relative', str(self.root) + '/../key', str(self.root) + '//key'):
            with self.assertRaises(ops.OpsError):
                ops.private_bytes(path)
        alias = self.root / 'alias'
        alias.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(OSError):
            ops.private_bytes(str(alias / 'key'))
        self.output.chmod(0o755)
        with self.assertRaises(ops.OpsError), ops.directory(str(self.output), private=True):
            pass
        self.output.chmod(0o700)
        self.root.chmod(0o777)
        with self.assertRaises(ops.OpsError):
            ops.private_bytes(str(self.key))
        self.root.chmod(0o700)
        self.tool.chmod(0o777)
        with self.assertRaises(ops.OpsError):
            ops.executable(str(self.tool))
        tool_link = self.root / 'tool-link'
        tool_link.symlink_to('/usr/bin/openssl')
        with self.assertRaises(OSError):
            ops.executable(str(tool_link))

    def test_dry_run_no_process_no_lock_no_changes(self):
        self.args.dry_run = True
        before = sorted(self.output.iterdir())
        with mock.patch.object(ops.subprocess, 'Popen', side_effect=AssertionError('must not execute')):
            result = ops.execute(self.args)
        self.assertFalse(result['connected'])
        self.assertEqual(before, sorted(self.output.iterdir()))

    def test_cli_dry_run_and_safe_failure(self):
        argv = []
        for key in ('runtime_config', 'expected_host', 'schema', 'ssl_root_cert', 'key_file', 'backup_dir', 'pg_dump', 'openssl'):
            argv.extend(['--' + key.replace('_', '-'), getattr(self.args, key)])
        command = [sys.executable, '-B', str(Path(__file__).with_name('pactra-hosted-backup.py')), *argv, '--dry-run']
        result = subprocess.run(command, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads(result.stdout)['connected'])
        self.config.write_text('{fixture-password-invalid-json')
        result = subprocess.run(command, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn('fixture-password', result.stderr)
        self.assertNotIn(str(self.root), result.stderr)

    def test_argument_bounds_schema_and_key(self):
        for field, values in {'schema': ['public', '*'], 'retain_count': [0, 91],
                              'timeout_seconds': [0, 601], 'max_dump_mib': [0, 513]}.items():
            old = getattr(self.args, field)
            for value in values:
                setattr(self.args, field, value)
                with self.assertRaises(ops.OpsError):
                    ops.execute(self.args)
            setattr(self.args, field, old)
        self.key.write_bytes(b'short')
        with self.assertRaises(ops.OpsError):
            ops.execute(self.args)

    def test_lock_concurrency_and_unsafe_lock(self):
        with ops.directory(str(self.output), private=True) as fd:
            with ops.lock(fd):
                with self.assertRaises(ops.OpsError), ops.lock(fd):
                    pass
            with ops.lock(fd):
                pass
        (self.output / '.pactra-hosted-backup.lock').unlink()
        (self.output / '.pactra-hosted-backup.lock').symlink_to(self.key)
        with ops.directory(str(self.output), private=True) as fd:
            with self.assertRaises(OSError), ops.lock(fd):
                pass

    def test_retention_only_owned_exact_names_no_symlinks(self):
        old = self.archive('20260101T000000Z')
        newest = self.archive('20260103T000000Z')
        current = self.archive('20260102T000000Z')
        untouched = [self.private('backups/' + name, b'untouched') for name in (
            'release-20250101T000000Z.dump.enc', 'daily-not-a-date.dump.enc',
            'daily-20251301T000000Z.dump.enc', 'daily-20250101T000000Z.dump.enc.extra',
            '.pactra-encrypted-abandoned')]
        link = self.output / 'daily-20240101T000000Z.dump.enc'
        link.symlink_to(self.key)
        hard = self.archive('20240102T000000Z')
        os.link(hard, self.root / 'hard-archive')
        wrong_mode = self.archive('20240103T000000Z')
        wrong_mode.chmod(0o644)
        folder = self.output / 'daily-20240104T000000Z.dump.enc'
        folder.mkdir()
        wrong_owner = self.archive('20240105T000000Z')
        original_owned = ops.owned
        inode = wrong_owner.stat().st_ino
        with ops.directory(str(self.output), private=True) as fd, mock.patch.object(
                ops, 'owned', side_effect=lambda info: info.st_ino != inode and original_owned(info)):
            self.assertEqual(ops.retain(fd, 2, current.name), 1)
        self.assertFalse(old.exists())
        for path in [newest, current, *untouched, link, hard, wrong_mode, folder, wrong_owner]:
            self.assertTrue(path.exists())
        self.assertTrue(link.is_symlink())
        self.assertEqual(self.key.read_bytes(), b'fixture-only-not-a-real-secret-' + b'x' * 32)

    def test_retention_clock_rollback_keeps_current(self):
        future = self.archive('20990101T000000Z')
        current = self.archive('20250101T000000Z')
        with ops.directory(str(self.output), private=True) as fd:
            self.assertEqual(ops.retain(fd, 1, current.name), 1)
        self.assertTrue(current.exists())
        self.assertFalse(future.exists())

    def test_dump_failure_and_encrypt_failure_never_prune(self):
        old = self.archive('20250101T000000Z')
        self.args.retain_count = 1
        for function in ('dump', 'seal', 'publish'):
            with mock.patch.object(ops, function, side_effect=ops.OpsError('fixture failure')):
                with self.assertRaises(ops.OpsError):
                    ops.execute(self.args)
            self.assertTrue(old.exists())
            self.assertEqual(list(self.output.glob('daily-*')), [old])
        failing = self.script('fail', 'import sys\nsys.stderr.write("fixture-sensitive-data")\nsys.exit(1)\n')
        config = ops.read_config(str(self.config), self.args.expected_host)
        with self.assertRaisesRegex(ops.OpsError, 'details suppressed'):
            ops.dump(config, self.ca.read_bytes(), str(failing), 2, 1024)

    def test_dump_size_timeout_and_exact_arguments(self):
        config = ops.read_config(str(self.config), self.args.expected_host)
        large = self.script('large', 'import os\nos.write(1, b"PGDMP" + b"x"*4096)\n')
        with self.assertRaisesRegex(ops.OpsError, 'size limit'):
            ops.dump(config, self.ca.read_bytes(), str(large), 2, 1024)
        slow = self.script('slow', 'import time\ntime.sleep(10)\n')
        with self.assertRaisesRegex(ops.OpsError, 'deadline'):
            ops.dump(config, self.ca.read_bytes(), str(slow), 0.05, 1024)
        with mock.patch.object(ops.subprocess, 'Popen', wraps=subprocess.Popen) as popen:
            self.assertEqual(ops.dump(config, self.ca.read_bytes(), str(self.tool), 2, 1024), b'PGDMP-offline-fixture')
        argv = popen.call_args.args[0]
        for flag in ('--schema=pactra', '--format=custom', '--no-blobs', '--strict-names', '-w'):
            self.assertIn(flag, argv)
        self.assertNotIn('--file', argv)

    def test_real_crypto_envelope_and_offline_publication(self):
        old = self.archive('20200101T000000Z')
        self.args.retain_count = 1
        result = ops.execute(self.args)
        self.assertTrue(result['encrypted'])
        self.assertEqual(result['removed'], 1)
        self.assertFalse(old.exists())
        archives = list(self.output.glob('daily-*'))
        self.assertEqual(len(archives), 1)
        blob = archives[0].read_bytes()
        self.assertTrue(ops.owned(archives[0].stat()))
        self.assertNotIn(b'PGDMP-offline-fixture', blob)
        password = self.key.read_bytes()

        def decrypt(data, key, decrypt=False):
            self.assertTrue(decrypt)
            with ops.memory_fd(key + b'\n') as fd:
                return subprocess.run(['/usr/bin/openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2',
                    '-iter', str(ops.ITERATIONS), '-md', 'sha256', '-pass', f'fd:{fd}'],
                    input=data, capture_output=True, check=True, pass_fds=(fd,),
                    env=ops.environment(), timeout=5).stdout

        with mock.patch.object(local, 'crypt', side_effect=decrypt):
            self.assertEqual(local.unseal(blob, password), b'PGDMP-offline-fixture')
            with self.assertRaises(local.OpsError):
                local.unseal(blob[:-1] + bytes([blob[-1] ^ 1]), password)
            with self.assertRaises(local.OpsError):
                local.unseal(blob, b'wrong key')
        self.assertFalse(list(self.output.glob('.pactra-encrypted-*')))
        with ops.directory(str(self.output), private=True) as fd:
            with self.assertRaises(FileExistsError):
                ops.publish(fd, archives[0].name, b'do not overwrite')
        self.assertEqual(archives[0].read_bytes(), blob)

    def test_publish_refuses_symlink_no_partial_left(self):
        name = 'daily-20250101T000000Z.dump.enc'
        (self.output / name).symlink_to(self.key)
        with ops.directory(str(self.output), private=True) as fd:
            with self.assertRaises(FileExistsError):
                ops.publish(fd, name, b'encrypted fixture')
        self.assertFalse(list(self.output.glob('.pactra-encrypted-*')))
        self.assertTrue((self.output / name).is_symlink())

    def test_housekeeping_entry_bound(self):
        fake_entries = [argparse.Namespace(name='unrelated')] * 4097
        cm = contextlib.nullcontext(iter(fake_entries))
        with mock.patch.object(ops.os, 'scandir', return_value=cm):
            with self.assertRaisesRegex(ops.OpsError, 'entry limit'):
                ops.entries(0)

    def test_owned_docs_links_and_file_whitespace(self):
        root = Path(__file__).resolve().parent.parent
        documents = [root / 'docs' / name for name in ('RELEASE_CHECKLIST.md', 'SUBMISSION_PACKAGE.md')]
        for document in documents:
            for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', document.read_text()):
                target = target.split('#')[0]
                if target and not re.match(r'^[a-z]+:', target):
                    self.assertTrue((document.parent / target).exists(), target)
        for path in [*documents, Path(__file__), Path(ops.__file__ or '')]:
            result = subprocess.run(['git', 'diff', '--no-index', '--check', '/dev/null', str(path)],
                                    capture_output=True, text=True, timeout=5)
            self.assertIn(result.returncode, (0, 1))
            self.assertEqual(result.stdout + result.stderr, '')


if __name__ == '__main__':
    unittest.main(verbosity=2)
