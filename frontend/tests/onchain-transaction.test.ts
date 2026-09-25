import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionAttempt } from '../lib/onchain-transaction.ts';
import { setWorkspaceIdentity } from '../lib/workspace-client.ts';
const hash = ('0x' + 'a'.repeat(64)) as `0x${string}`;
test('session invalidation synchronously disposes a wallet intent before React cleanup', () => {
  const attempt = createTransactionAttempt(() => {});
  setWorkspaceIdentity({ address: '0x1111111111111111111111111111111111111111', chainId: 31337 });
  assert.equal(attempt.snapshot.phase, 'disposed');
  setWorkspaceIdentity(null);
});

test('transaction simulates, requests wallet once, waits for receipt and reads back', async () => {
  const events: string[] = [];
  const attempt = createTransactionAttempt(() => events.push(attempt.snapshot.phase));
  await attempt.send({ validate: async () => { events.push('validate'); }, send: async () => hash, receipt: async () => ({ status: 'success', transactionHash: hash }), readback: async () => { events.push('readback'); } });
  assert.deepEqual(events, ['checking', 'validate', 'wallet', 'pending', 'confirming', 'readback', 'success']);
  assert.equal(attempt.snapshot.hash, hash);
  await assert.rejects(attempt.send({} as never));
});
test('rejected wallet and reverted receipt are distinct and no success readback is invented', async () => {
  for (const rejected of [true, false]) {
    const attempt = createTransactionAttempt(() => {});
    await attempt.send({ validate: async () => {}, send: async () => { if (rejected) throw { code: 4001 }; return hash; }, receipt: async () => ({ status: 'reverted', transactionHash: hash }), readback: async () => { assert.fail('must not read success'); } });
    assert.equal(attempt.snapshot.phase, rejected ? 'rejected' : 'reverted');
  }
});
test('unknown broadcast or receipt outcome never auto-retries; receipt check does not re-send', async () => {
  let sends = 0, receipts = 0;
  const attempt = createTransactionAttempt(() => {});
  const operations = { validate: async () => {}, send: async () => { sends++; return hash; }, receipt: async () => { if (++receipts === 1) throw Error('timeout'); return { status: 'success' as const, transactionHash: hash }; }, readback: async () => {} };
  await attempt.send(operations);
  assert.equal(attempt.snapshot.phase, 'uncertain');
  await attempt.checkReceipt();
  assert.equal(attempt.snapshot.phase, 'success'); assert.equal(sends, 1);
});
test('identity disposal during validation prevents wallet call and clears private state', async () => {
  let release!: () => void;
  const attempt = createTransactionAttempt(() => {});
  const promise = attempt.send({ validate: () => new Promise<void>(r => { release = r; }), send: async () => { assert.fail('stale wallet'); return hash; }, receipt: async () => ({ status: 'success', transactionHash: hash }), readback: async () => {} });
  attempt.dispose(); release(); await promise;
  assert.deepEqual(attempt.snapshot, { phase: 'disposed', hash: null });
});
test('duplicate concurrent sends and stale receipt updates are blocked', async () => {
  let release!: (value: {status: 'success'; transactionHash: typeof hash}) => void;
  const attempt = createTransactionAttempt(() => {});
  const operations = { validate: async () => {}, send: async () => hash, receipt: () => new Promise<{status: 'success'; transactionHash: typeof hash}>(r => { release = r; }), readback: async () => assert.fail('stale readback') };
  const pending = attempt.send(operations);
  await assert.rejects(attempt.send(operations));
  await new Promise(r => setImmediate(r));
  attempt.dispose(); release({ status: 'success', transactionHash: hash }); await pending;
  assert.equal(attempt.snapshot.phase, 'disposed');
});
