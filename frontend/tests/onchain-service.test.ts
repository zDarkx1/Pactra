import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, type PublicClient } from 'viem';
import { prepareTaskCall, readVerifiedTask, assertReceiptTransaction, assertTaskReadback, freezeReviewEvidence, assertReviewEvidence } from '../lib/onchain-service.ts';
import { createTransactionAttempt } from '../lib/onchain-transaction.ts';
import { escrowAbi } from '../lib/onchain-contract.ts';
import { setWorkspaceIdentity } from '../lib/workspace-client.ts';
import type { Task } from '../lib/workspace-types.ts';
const buyer = '0x1111111111111111111111111111111111111111';
const worker = '0x2222222222222222222222222222222222222222';
const escrow = '0x5555555555555555555555555555555555555555';
const digest = '0x' + 'd'.repeat(64);
const config = { enabled: true, chain_id: '31337', escrow_address: escrow, confirmations: 2, attestation_available: false };
const task = { id: '11111111-1111-4111-8111-111111111111', status: 'accepted_unfunded', manifest_hash: 'a'.repeat(64), manifest: { buyer, worker, primary_arbiter: '0x3333333333333333333333333333333333333333', backup_arbiter: '0x4444444444444444444444444444444444444444', chain_id: 31337, version: 1, delivery_deadline: '2027-01-01T00:00:00Z', total_base_units: '100', deliverables: [{ id: 'copy', amount_base_units: '100', revision_limit: 2, review_period_hours: 24 }] } } as Task;
const binding = { task_id: task.id, chain_id: '31337', escrow_address: escrow, onchain_task_id: '7', transaction_hash: '0x' + 'b'.repeat(64), block_number: '10', block_hash: '0x' + 'c'.repeat(64), manifest_digest: digest };
const b = BigInt;
test('a cancelled or unrelated replacement receipt is never credited to the confirmed action', () => {
  const call = { to: escrow, account: buyer, data: '0x1234', value: b(100), chainId: 31337 } as const;
  const tx = { to: escrow, from: buyer, input: '0x1234', value: b(100) };
  assert.doesNotThrow(() => assertReceiptTransaction(call, tx));
  for (const patch of [{ to: buyer }, { from: worker }, { input: '0x' }, { value: b(0) }]) assert.throws(() => assertReceiptTransaction(call, { ...tx, ...patch }));
});
function fixture(bound: boolean, status = 1, badAllocation = false) {
  const original = globalThis.fetch;
  setWorkspaceIdentity({ address: buyer, chainId: 31337 });
  globalThis.fetch = async () => bound ? Response.json(binding) : Response.json({ error: { message: 'Unbound' } }, { status: 404 });
  const calls: any[] = [];
  const client = { getBlockNumber: async () => b(13), getBlock: async () => ({ number: b(12), timestamp: b(1000) }), readContract: async (p: any) => {
    if (p.functionName === 'getTask') return [buyer, worker, task.manifest.primary_arbiter, task.manifest.backup_arbiter, digest, b(31337), status, b(1), b(0)];
    if (p.functionName === 'getTaskManifest') return [b(1), '0x' + task.manifest_hash];
    if (p.functionName === 'manifestDigest') return digest;
    if (p.functionName === 'boundManifests') return false;
    if (p.functionName === 'balances') return b(25);
    if (p.functionName === 'getDeliverable') return [b(badAllocation ? 99 : 100), 2, b(86400), 0, 0, b(0), b(0), b(0), b(0), b(0)];
    if (p.functionName === 'getDeliveryEvidence') return [b(Date.parse(task.manifest.delivery_deadline) / 1000), false, '0x' + '0'.repeat(64), b(0)];
    throw Error('Unexpected read ' + p.functionName);
  }, call: async (p: any) => { calls.push(p); return {}; } } as unknown as PublicClient;
  return { client, calls, restore: () => { globalThis.fetch = original; setWorkspaceIdentity(null); } };
}
for (const action of ['acceptDeliverable', 'requestRevision', 'openDispute'] as const) {
  test(`${action} blocks held round-one confirmation after round-two replacement`, async () => {
    const f = fixture(true, 2);
    const read = f.client.readContract;
    f.client.readContract = (async (p: any) => {
      if (p.functionName === 'getDeliverable') return [b(100), 2, b(86400), 1, 1, b(1001), b(0), b(0), b(0), b(0)];
      if (p.functionName === 'getDeliveryEvidence') return [b(Date.parse(task.manifest.delivery_deadline) / 1000), true, '0x' + 'b'.repeat(64), b(2000)];
      return read(p);
    }) as typeof read;
    try {
      await assert.rejects(prepareTaskCall(f.client, config, task, buyer, { action, index: 0, reviewEvidence: { round: b(1), artifactHash: ('0x' + 'a'.repeat(64)) as `0x${string}`, submittedAt: b(1000) } }), /evidence changed/i);
      assert.equal(f.calls.length, 0);
    } finally { f.restore(); }
  });
}
test('frozen review evidence is copied and each field independently rejects changes', async () => {
  const f = fixture(true, 2);
  try {
    const state = (await readVerifiedTask(f.client, config, task))!;
    const a = { ...state.allocations[0], status: 1, everSubmitted: true, artifactHash: ('0x' + 'a'.repeat(64)) as `0x${string}`, submittedAt: b(1000) };
    const frozen = freezeReviewEvidence(a);
    assert.ok(Object.isFrozen(frozen));
    assert.deepEqual(frozen, { round: b(1), artifactHash: a.artifactHash, submittedAt: b(1000) });
    for (const patch of [{ revisionsUsed: 1 }, { artifactHash: ('0x' + 'b'.repeat(64)) as `0x${string}` }, { submittedAt: b(1001) }]) assert.throws(() => assertReviewEvidence({ ...a, ...patch }, frozen), /evidence changed/i);
    assert.throws(() => assertReviewEvidence(a, undefined), /consent required/);
    a.submittedAt = b(1002);
    assert.equal(frozen.submittedAt, b(1000));
  } finally { f.restore(); }
});
for (const action of ['acceptDeliverable', 'requestRevision', 'openDispute'] as const) {
  test(`${action} uses frozen calldata and rejects unconfirmed head changes before wallet`, async () => {
    const f = fixture(true, 2);
    const read = f.client.readContract;
    let changed = false;
    const heads: any[] = [];
    f.client.getBlockNumber = (async (p: any) => { heads.push(p); return b(13); }) as any;
    f.client.getBlock = (async (p: any) => ({ number: p.blockNumber, hash: '0x' + 'c'.repeat(64), timestamp: b(1100) })) as any;
    const hash = ('0x' + 'a'.repeat(64)) as `0x${string}`;
    f.client.readContract = (async (p: any) => {
      const replacement = changed && p.blockNumber === b(13);
      if (p.functionName === 'getDeliverable') return [b(100), 2, b(86400), 1, replacement ? 1 : 0, b(1000), b(0), b(0), b(0), b(0)];
      if (p.functionName === 'getDeliveryEvidence') return [b(Date.parse(task.manifest.delivery_deadline) / 1000), true, hash, b(2000)];
      return read(p);
    }) as typeof read;
    const intent = { action, index: 0, reviewEvidence: Object.freeze({ round: b(1), artifactHash: hash, submittedAt: b(1000) }) };
    try {
      await assert.rejects(prepareTaskCall(f.client, config, task, buyer, { action, index: 0 }), /consent required/);
      const call = await prepareTaskCall(f.client, config, task, buyer, intent);
      assert.deepEqual(decodeFunctionData({ abi: escrowAbi, data: call.data }), { functionName: action, args: [b(7), b(0), b(1), hash, b(1000)] });
      assert.deepEqual(heads.at(-1), { cacheTime: 0 });
      assert.equal(call.value, b(0));
      changed = true;
      let walletCalls = 0;
      const attempt = createTransactionAttempt(() => {});
      await attempt.send({ validate: async () => { await prepareTaskCall(f.client, config, task, buyer, intent); }, send: async () => { walletCalls++; return '0x1234'; }, receipt: async () => { throw Error('must not send'); }, readback: async () => { throw Error('must not send'); } });
      assert.equal(attempt.snapshot.phase, 'blocked');
      assert.equal(walletCalls, 0);
      assert.equal(f.calls.length, 1);
      attempt.dispose();
    } finally { f.restore(); }
  });
}
test('service creates only accepted unbound buyer terms and simulates exact ABI calldata', async () => {
  const f = fixture(false);
  try {
    const call = await prepareTaskCall(f.client, config, task, buyer, { action: 'createTask' });
    assert.equal(decodeFunctionData({ abi: escrowAbi, data: call.data }).functionName, 'createTask');
    assert.equal(call.value, b(0)); assert.equal(f.calls.length, 1);
    await assert.rejects(prepareTaskCall(f.client, config, task, worker, { action: 'createTask' }));
  } finally { f.restore(); }
});
test('funding requires matching immutable binding, buyer role, accepted chain state and exact value', async () => {
  const f = fixture(true);
  try {
    const call = await prepareTaskCall(f.client, config, task, buyer, { action: 'fundTask' });
    assert.deepEqual(decodeFunctionData({ abi: escrowAbi, data: call.data }), { functionName: 'fundTask', args: [b(7)] });
    assert.equal(call.value, b(100)); assert.equal(call.to, escrow);
    await assert.rejects(prepareTaskCall(f.client, config, task, worker, { action: 'fundTask' }));
    await assert.rejects(prepareTaskCall(f.client, config, task, buyer, { action: 'createTask' }));
  } finally { f.restore(); }
});
test('mismatched allocation and already-funded state prevent funding simulation', async () => {
  for (const badAllocation of [true, false]) {
    const f = fixture(true, badAllocation ? 1 : 2, badAllocation);
    try { await assert.rejects(prepareTaskCall(f.client, config, task, buyer, { action: 'fundTask' })); assert.equal(f.calls.length, 0); }
    finally { f.restore(); }
  }
});
test('missing attestor cannot submit and backend binding mismatch fails closed', async () => {
  const f = fixture(true, 2);
  try {
    await assert.rejects(prepareTaskCall(f.client, config, task, worker, { action: 'submitDeliverable', index: 0 }));
    globalThis.fetch = async () => Response.json({ ...binding, escrow_address: buyer });
    await assert.rejects(readVerifiedTask(f.client, config, task));
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});
test('submission requires frozen artifact consent before fetching an availability signature', async () => {
  const f = fixture(true, 2);
  try {
    await assert.rejects(prepareTaskCall(f.client, { ...config, attestation_available: true }, task, worker, { action: 'submitDeliverable', index: 0 }), /artifact consent/);
  } finally { f.restore(); }
});
test('withdrawal requires the exact displayed nonzero credit balance', async () => {
  const f = fixture(true, 2);
  try {
    await assert.rejects(prepareTaskCall(f.client, config, task, buyer, { action: 'withdraw' }));
    await assert.rejects(prepareTaskCall(f.client, config, task, buyer, { action: 'withdraw', expectedBalance: b(24) }));
    const call = await prepareTaskCall(f.client, config, task, buyer, { action: 'withdraw', expectedBalance: b(25) });
    assert.equal(decodeFunctionData({ abi: escrowAbi, data: call.data }).functionName, 'withdraw');
  } finally { f.restore(); }
});
test('successful receipt still requires the requested state transition in readback', async () => {
  const f = fixture(true, 1);
  try {
    const current = (await readVerifiedTask(f.client, config, task))!;
    assert.throws(() => assertTaskReadback(current, { action: 'fundTask' }));
    assert.throws(() => assertTaskReadback(current, { action: 'submitDeliverable', index: 0, artifactHash: 'a'.repeat(64) }));
    assert.throws(() => assertTaskReadback(current, { action: 'acceptDeliverable', index: 0 }));
    assert.throws(() => assertTaskReadback(current, { action: 'refundUnsubmitted', index: 0 }));
    assert.doesNotThrow(() => assertTaskReadback(current, { action: 'acceptTask' }));
  } finally { f.restore(); }
});
