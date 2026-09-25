import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escrowAbi, createArguments, assertDeployment, allocationSplit } from '../lib/onchain-contract.ts';
import type { Task } from '../lib/workspace-types.ts';
const address = '0x1111111111111111111111111111111111111111';
const task = { status: 'accepted_unfunded', manifest_hash: 'a'.repeat(64), manifest: { buyer: address, worker: address, primary_arbiter: address, backup_arbiter: address, chain_id: 31337, version: 1, delivery_deadline: '2027-01-01T00:00:00Z', total_base_units: '100', deliverables: [{ amount_base_units: '100', revision_limit: 2, review_period_hours: 24 }] } } as Task;
test('vendored ABI is exactly generated contract ABI, no guessed selectors', () => {
  assert.deepEqual(escrowAbi, JSON.parse(readFileSync(new URL('../../contracts/PactraEscrow.abi.json', import.meta.url), 'utf8')));
});
test('creation maps exact accepted manifest and rejects rounding or uint128 overflow', () => {
  const args = createArguments(task);
  assert.equal(args[5], '0x' + task.manifest_hash);
  assert.equal(args[6][0].amount, BigInt(100)); assert.equal(args[6][0].reviewWindow, BigInt(86400));
  assert.throws(() => createArguments({ ...task, manifest: { ...task.manifest, delivery_deadline: '2027-01-01T00:00:00.001Z' } }));
  assert.throws(() => createArguments({ ...task, manifest: { ...task.manifest, total_base_units: '101' } }));
  assert.throws(() => createArguments({ ...task, manifest: { ...task.manifest, deliverables: [{ ...task.manifest.deliverables[0], amount_base_units: (BigInt(2) ** BigInt(128)).toString() }] } }));
});
test('deployment gate requires backend enabled, matching session/wallet/RPC chain and code', () => {
  const config = { enabled: true, chain_id: '31337', escrow_address: address, confirmations: 2, attestation_available: false };
  assert.doesNotThrow(() => assertDeployment(config, 31337, 31337, 31337, '0x6000'));
  for (const [session, wallet, rpc, code] of [[1,31337,31337,'0x6000'],[31337,1,31337,'0x6000'],[31337,31337,1,'0x6000'],[31337,31337,31337,'0x']] as const) assert.throws(() => assertDeployment(config, session, wallet, rpc, code));
  assert.throws(() => assertDeployment({ ...config, enabled: false },31337,31337,31337,'0x6000'));
});
test('allocation split uses exact base units, no floats or over-allocation', () => {
  assert.deepEqual(allocationSplit('100', '35'), { worker: BigInt(35), buyer: BigInt(65) });
  for (const value of ['101', '-1', '1.5', '01', '1e2']) assert.throws(() => allocationSplit('100', value));
});
