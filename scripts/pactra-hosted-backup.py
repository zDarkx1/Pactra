#!/usr/bin/env python3
"""Bounded hosted pactra backup. Explicit inputs; no provisioning or restore."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import hmac
import json
import os
import re
import resource
import secrets
import selectors
import stat
import subprocess
import sys
import time
from urllib.parse import parse_qsl, unquote, urlsplit

MAGIC = b'PACTRA-OPS-1\n'
ITERATIONS = 200000
DAILY = re.compile(r'daily-([0-9]{8}T[0-9]{6}Z)\.dump\.enc\Z')


class OpsError(Exception):
    pass


def parts(path):
    if not isinstance(path, str) or not path.startswith('/') or '\x00' in path:
        raise OpsError('absolute paths required')
    items = path.split('/')[1:]
    if not items or any(p in ('', '.', '..') for p in items):
        raise OpsError('noncanonical path refused')
    return items


@contextlib.contextmanager
def directory(path, private=False):
    """Walk descriptors, never symlinks; permit only trusted directory ancestry."""
    items = [] if path == '/' else parts(path)
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for item in items:
            new = os.open(item, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = new
            info = os.fstat(fd)
            # Root-owned sticky ancestors (e.g. /tmp) cannot replace an owned child.
            sticky_root = info.st_uid == 0 and bool(info.st_mode & stat.S_ISVTX)
            if info.st_uid not in (0, os.geteuid()) or (info.st_mode & 0o022 and not sticky_root):
                raise OpsError('untrusted directory ancestry')
        info = os.fstat(fd)
        if private and (info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700):
            raise OpsError('backup directory must be owned mode0700')
        yield fd
    finally:
        os.close(fd)


def owned(info):
    return (stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid()
            and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1)


def private_bytes(path, limit=65536):
    items = parts(path)
    with directory('/' + '/'.join(items[:-1]) if len(items) > 1 else '/') as parent:
        fd = os.open(items[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        with os.fdopen(fd, 'rb') as stream:
            if not owned(os.fstat(stream.fileno())):
                raise OpsError('inputs must be owned single-link regular mode0600 files')
            value = stream.read(limit + 1)
            if len(value) > limit:
                raise OpsError('input exceeds limit')
            return value


def executable(path):
    items = parts(path)
    with directory('/' + '/'.join(items[:-1]) if len(items) > 1 else '/') as parent:
        fd = os.open(items[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            info = os.fstat(fd)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid not in (0, os.geteuid())
                    or info.st_mode & 0o022 or not info.st_mode & 0o111):
                raise OpsError('untrusted executable')
        finally:
            os.close(fd)
    return path


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise OpsError('duplicate configuration field')
        result[key] = value
    return result


def host_ok(host):
    return (isinstance(host, str) and len(host) <= 253
            and '.' in host and host == host.lower()
            and all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', p)
                    for p in host.split('.')))


def read_config(path, expected_host):
    if not host_ok(expected_host):
        raise OpsError('explicit project DNS hostname required')
    try:
        value = json.loads(private_bytes(path), object_pairs_hook=no_duplicates)
        if not isinstance(value, dict) or set(value) != {'database_url'}:
            raise OpsError('runtime config requires only database_url')
        raw = value['database_url']
        if not isinstance(raw, str) or any(ord(c) <= 32 or ord(c) == 127 for c in raw):
            raise OpsError('invalid database URL')
        u = urlsplit(raw)
        if (u.scheme not in ('postgres', 'postgresql') or u.hostname != expected_host
                or u.fragment or not u.port or not u.username or not u.password):
            raise OpsError('explicit project connection fields required')
        query = parse_qsl(u.query, keep_blank_values=True, strict_parsing=True)
        if query not in ([], [('sslmode', 'verify-full')]):
            raise OpsError('URL connection overrides refused')
        user, password, database = (unquote(u.username, errors='strict'),
                                    unquote(u.password, errors='strict'),
                                    unquote(u.path[1:], errors='strict'))
        if (not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', user)
                or not re.fullmatch(r'[A-Za-z0-9_-]{1,63}', database)
                or not password or any(ord(c) < 32 or ord(c) == 127 for c in password)
                or re.search(r'%(?![0-9a-fA-F]{2})', raw)):
            raise OpsError('invalid connection values')
        return {'PGHOST': expected_host, 'PGPORT': str(u.port), 'PGUSER': user,
                'PGDATABASE': database, 'PGPASSWORD': password}
    except (ValueError, UnicodeError, TypeError):
        raise OpsError('invalid runtime configuration') from None


def environment(config=None, ca_fd=None):
    env = {'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent', 'LC_ALL': 'C',
           'PGPASSFILE': '/dev/null', 'PGSERVICEFILE': '/dev/null',
           'PGSYSCONFDIR': '/nonexistent', 'PGCONNECT_TIMEOUT': '10',
           'PGSSLMODE': 'verify-full', 'PGGSSENCMODE': 'disable',
           'PGSSLMINPROTOCOLVERSION': 'TLSv1.2',
           'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000 -c timezone=UTC'}
    if config:
        env.update(config)
    if ca_fd is not None:
        env['PGSSLROOTCERT'] = f'/proc/self/fd/{ca_fd}'
    return env


@contextlib.contextmanager
def memory_fd(data):
    fd = os.memfd_create('pactra-private', os.MFD_CLOEXEC)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(os.dup(fd), 'wb') as stream:
            stream.write(data)
        os.lseek(fd, 0, os.SEEK_SET)
        yield fd
    finally:
        os.close(fd)


def dump(config, ca, tool, timeout, max_bytes):
    """Bound stdout in memory and wall time; never spool plaintext or stderr."""
    with memory_fd(ca) as ca_fd:
        p = subprocess.Popen([tool, '-w', '--format=custom', '--schema=pactra',
                              '--strict-names', '--no-blobs', '--no-owner', '--no-privileges',
                              '--lock-wait-timeout=5000'], env=environment(config, ca_fd),
                             stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, pass_fds=(ca_fd,), start_new_session=True)
        assert p.stdout is not None
        try:
            result = bytearray()
            deadline = time.monotonic() + timeout
            with selectors.DefaultSelector() as selector:
                selector.register(p.stdout, selectors.EVENT_READ)
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not selector.select(remaining):
                        raise OpsError('dump deadline exceeded')
                    chunk = os.read(p.stdout.fileno(), min(65536, max_bytes + 1 - len(result)))
                    if not chunk:
                        break
                    result.extend(chunk)
                    if len(result) > max_bytes:
                        raise OpsError('dump size limit exceeded')
            if p.wait(timeout=max(0.001, deadline - time.monotonic())) or not result.startswith(b'PGDMP'):
                raise OpsError('dump failed; details suppressed')
            return bytes(result)
        finally:
            if p.poll() is None:
                p.kill()
            p.wait()
            p.stdout.close()


def seal(data, password, tool, timeout):
    # Same envelope as local ops, but key material is an anonymous memory fd.
    with memory_fd(password + b'\n') as fd:
        result = subprocess.run([tool, 'enc', '-aes-256-cbc', '-pbkdf2', '-iter',
                                 str(ITERATIONS), '-md', 'sha256', '-pass', f'fd:{fd}'],
                                input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                env=environment(), pass_fds=(fd,), timeout=timeout)
    if result.returncode or not result.stdout.startswith(b'Salted__'):
        raise OpsError('encryption failed; details suppressed')
    salt = secrets.token_bytes(32)
    body = MAGIC + salt + result.stdout
    key = hashlib.pbkdf2_hmac('sha256', password, b'pactra-ops-mac-v1:' + salt, ITERATIONS)
    return body + hmac.digest(key, body, 'sha256')


@contextlib.contextmanager
def lock(directory_fd):
    fd = os.open('.pactra-hosted-backup.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK,
                 0o600, dir_fd=directory_fd)
    try:
        if not owned(os.fstat(fd)):
            raise OpsError('unsafe lock file')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise OpsError('backup already running') from None
        yield
    finally:
        os.close(fd)


def publish(directory_fd, name, blob):
    temporary = '.pactra-encrypted-' + secrets.token_hex(16)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 0o600, dir_fd=directory_fd)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(blob)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, name, src_dir_fd=directory_fd, dst_dir_fd=directory_fd,
                follow_symlinks=False)
    finally:
        os.unlink(temporary, dir_fd=directory_fd)
    os.fsync(directory_fd)


def retain(directory_fd, count, current):
    """Exclusive directory namespace; only exact, owned daily archives eligible."""
    if not 1 <= count <= 90:
        raise OpsError('retention outside bounds')
    candidates = []
    for name in entries(directory_fd):
        match = DAILY.fullmatch(name)
        if not match:
            continue
        try:
            dt.datetime.strptime(match[1], '%Y%m%dT%H%M%SZ')
            info = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except (ValueError, FileNotFoundError):
            continue
        if owned(info):
            candidates.append((name, info))
    # Always preserve the newly published backup, including after clock rollback.
    candidates.sort(key=lambda item: (item[0] == current, item[0]), reverse=True)
    removed = 0
    for name, before in candidates[count:]:
        after = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if owned(after) and (before.st_dev, before.st_ino) == (after.st_dev, after.st_ino):
            os.unlink(name, dir_fd=directory_fd)
            removed += 1
    os.fsync(directory_fd)
    return removed


def entries(directory_fd):
    # Bound housekeeping work even if unrelated files accumulate. No deletion
    # takes place when this cap is exceeded; an operator must inspect privately.
    names = []
    with os.scandir(directory_fd) as iterator:
        for entry in iterator:
            if len(names) >= 4096:
                raise OpsError('backup directory entry limit exceeded')
            names.append(entry.name)
    return names


def execute(args):
    if args.schema != 'pactra':
        raise OpsError('only pactra schema is permitted')
    if not 1 <= args.retain_count <= 90 or not 1 <= args.timeout_seconds <= 600:
        raise OpsError('retention or deadline outside bounds')
    if not 1 <= args.max_dump_mib <= 512:
        raise OpsError('dump memory limit outside bounds')
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    config = read_config(args.runtime_config, args.expected_host)
    password = private_bytes(args.key_file, 1025)
    if not re.fullmatch(rb'[\x21-\x7e]{32,1024}\n?', password):
        raise OpsError('key requires 32-1024 printable non-space characters')
    password = password.rstrip(b'\n')
    ca = private_bytes(args.ssl_root_cert, 1048576)
    if b'-----BEGIN CERTIFICATE-----' not in ca or b'PRIVATE KEY' in ca:
        raise OpsError('CA certificate input required')
    pg_dump = executable(args.pg_dump)
    openssl = executable(args.openssl)
    with directory(args.backup_dir, private=True) as output:
        if args.dry_run:
            return {'operation': 'dry-run', 'validated': True, 'connected': False}
        with lock(output):
            name = 'daily-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.dump.enc'
            if name in entries(output):
                raise OpsError('daily output already exists; no overwrite')
            data = dump(config, ca, pg_dump, args.timeout_seconds, args.max_dump_mib * 1024 * 1024)
            blob = seal(data, password, openssl, args.timeout_seconds)
            publish(output, name, blob)
            try:
                removed = retain(output, args.retain_count, name)
            except (OSError, OpsError):
                raise OpsError('backup published; retention failed; inspect privately') from None
            return {'operation': 'backup', 'encrypted': True, 'retained_limit': args.retain_count,
                    'removed': removed}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ('runtime-config', 'expected-host', 'schema', 'ssl-root-cert', 'key-file',
                   'backup-dir', 'pg-dump', 'openssl'):
        parser.add_argument('--' + option, required=True)
    parser.add_argument('--retain-count', type=int, default=7)
    parser.add_argument('--timeout-seconds', type=int, default=120)
    parser.add_argument('--max-dump-mib', type=int, default=64)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args(argv)
    try:
        print(json.dumps(execute(args), sort_keys=True))
        return 0
    except (OpsError, OSError, ValueError, subprocess.SubprocessError):
        error = sys.exc_info()[1]
        print(str(error) if isinstance(error, OpsError) else 'operation failed; details suppressed', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
