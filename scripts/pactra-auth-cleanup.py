#!/usr/bin/env python3
"""Bounded local-only auth maintenance; dry-run unless --delete is explicit."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('pactra_ops', Path(__file__).with_name('pactra-backup-restore.py'))
assert spec is not None and spec.loader is not None
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


def cleanup_sql(batch_size, retention_seconds, delete=False):
    if type(batch_size) is not int or not 1 <= batch_size <= 1000:
        raise ValueError('batch size must be 1..1000')
    if type(retention_seconds) is not int or not 0 <= retention_seconds <= 31536000:
        raise ValueError('retention seconds must be 0..31536000')
    # A spent but unexpired challenge is retained. Limits expire one minute after
    # window_start, matching workspace.go; retention starts AFTER that expiry.
    specs = (('sessions', 'token_hash', 'expires_at'),
             ('challenges', 'id', 'expires_at'),
             ('challenge_limits', 'address', "window_start + interval '1 minute'"))
    queries = ['BEGIN;' if delete else 'BEGIN READ ONLY;',
               "SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s';"]
    for table, key, expiry in specs:
        predicate = f"{expiry} <= transaction_timestamp() - make_interval(secs => {retention_seconds})"
        selection = f'SELECT {key} FROM pactra.{table} WHERE {predicate} ORDER BY {expiry}, {key} LIMIT {batch_size}'
        if delete:
            queries.append(f"WITH candidates AS ({selection} FOR UPDATE SKIP LOCKED), removed AS (DELETE FROM pactra.{table} t USING candidates c WHERE t.{key}=c.{key} AND {predicate} RETURNING 1) SELECT json_build_object('table','{table}','count',count(*)) FROM removed;")
        else:
            queries.append(f"SELECT json_build_object('table','{table}','count',count(*)) FROM ({selection}) candidates;")
    queries.append('COMMIT;')
    return '\n'.join(queries)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True, help='owned mode0600 explicit local connection file')
    parser.add_argument('--batch-size', type=int, default=100, help='per table, one batch only; 1..1000')
    parser.add_argument('--retention-seconds', type=int, default=86400, help='retain after expiry, default one day; 0..31536000')
    parser.add_argument('--delete', action='store_true', help='explicitly delete bounded expired records')
    args = parser.parse_args()
    try:
        statement = cleanup_sql(args.batch_size, args.retention_seconds, args.delete)
        config = ops.read_config(args.env_file, 'source')
        ops.check_server(config)
        ops.supported_tables(config)
        results = [json.loads(line) for line in ops.sql(config, statement).splitlines()]
        counts = {row['table']: row['count'] for row in results}
        if set(counts) != {'sessions', 'challenges', 'challenge_limits'}:
            raise ops.OpsError('unexpected maintenance result')
        print(json.dumps({'mode': 'delete' if args.delete else 'dry-run', 'batch_size_per_table': args.batch_size, 'retention_seconds': args.retention_seconds, 'counts': counts}, sort_keys=True))
        return 0
    except (ops.OpsError, OSError, ValueError):
        print('auth cleanup failed; details suppressed', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
