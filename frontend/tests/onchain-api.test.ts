import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceRoute, workspaceQuery } from '../lib/workspace-path.ts';
import { parseOnchainConfig, parseArbiterQueue } from '../lib/onchain-types.ts';
const id = '11111111-1111-4111-8111-111111111111';
test('only explicit settlement routes are admitted; queue pagination is bounded', () => {
  for (const path of ['/onchain/config', '/arbiter/disputes', `/arbiter/tasks/${id}/deliverables/x/evidence`, `/tasks/${id}/onchain`, `/tasks/${id}/onchain/reconcile`, `/tasks/${id}/deliverables/x/onchain/availability`]) assert.ok(workspaceRoute(path), path);
  for (const path of ['/onchain/sign', '/arbiter/tasks', `/arbiter/tasks/${id}`, `/tasks/${id}/onchain/resolve`, '/arbiter/disputes/../secrets']) assert.equal(workspaceRoute(path), null);
  assert.equal(workspaceQuery(workspaceRoute('/arbiter/disputes')!, 'GET', '?limit=50'), '?limit=50');
  assert.throws(() => workspaceQuery(workspaceRoute('/arbiter/disputes')!, 'GET', '?address=0x123'));
});
test('config is explicit, bounded and never forwards secrets or enables a zero contract', () => {
  const config = { enabled: false, chain_id: '31337', escrow_address: '', confirmations: 2, attestation_available: false };
  assert.deepEqual(parseOnchainConfig({ ...config, signing_key: 'NEVER' }), config);
  assert.throws(() => parseOnchainConfig({ ...config, enabled: true }));
  assert.throws(() => parseOnchainConfig({ ...config, enabled: true, escrow_address: '0x' + '0'.repeat(40) }));
  assert.throws(() => parseOnchainConfig({ ...config, chain_id: 31337 }));
  assert.deepEqual(parseOnchainConfig({ ...config, confirmations: 0 }), { ...config, confirmations: 0 });
  assert.throws(() => parseOnchainConfig({ ...config, enabled: true, escrow_address: '0x1111111111111111111111111111111111111111', confirmations: 0 }));
});
test('arbiter queue projects only persisted case metadata; no nomination inference', () => {
  const item = { task_id: id, deliverable_id: 'x', manifest_hash: 'a'.repeat(64), version: 1, artifact_hash: 'b'.repeat(64), created_at: '2026-09-25T00:00:00Z' };
  assert.deepEqual(parseArbiterQueue({ disputes: [{ ...item, signing_key: 'NEVER' }], next_cursor: null, secret: 'NEVER' }), { disputes: [item], next_cursor: null });
  assert.throws(() => parseArbiterQueue({ disputes: [{ ...item, artifact_hash: '0x' + item.artifact_hash }], next_cursor: null }));
  assert.throws(() => parseArbiterQueue({ disputes: [item], next_cursor: '' }));
});
