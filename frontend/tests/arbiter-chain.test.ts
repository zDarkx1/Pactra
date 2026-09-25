import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { escrowAbi } from '../lib/escrow-abi.ts';
import { parseScopedChain, arbiterChainTarget } from '../lib/arbiter-chain.ts';
const id = BigInt(7), index = BigInt(0);
const allocation = { deliverable_id: 'copy', index: 0, state: 'disputed', round: '1', revisions_used: '0', submitted_at: '900', dispute_opened_at: '1000', handover_at: '0', worker_award: '0', buyer_refund: '0', ever_submitted: true, artifact_hash: '0x' + 'a'.repeat(64), attestation_expiry: '1100', settlement_nonce: '0', local_state: 'submitted', local_version: 1, evidence_matches: true, next_local_submission: false };
const event = { name: 'DisputeOpened', index: 0, transaction_hash: '0x' + 'b'.repeat(64), block_number: '10', block_hash: '0x' + 'c'.repeat(64), log_index: '0', topics: encodeEventTopics({ abi: escrowAbi, eventName: 'DisputeOpened', args: { taskId: id, index, opener: '0x1111111111111111111111111111111111111111' } }), data: encodeAbiParameters([{ type:'uint64' }], [BigInt(1000)]) };
const snapshot = { block_number: '11', block_hash: '0x' + 'd'.repeat(64), timestamp:'1001', task_state:'funded', settled_count:'0', allocations:[allocation], events:[event] };
test('scoped chain events yield contract task/index only after strict ABI and scope checks', () => {
  const parsed = parseScopedChain({ ...snapshot, secret:'never' }, 'copy');
  assert.equal('secret' in parsed, false);
  assert.deepEqual(arbiterChainTarget(parsed), { taskId: id, index: 0 });
  assert.throws(() => parseScopedChain({ ...snapshot, allocations:[allocation, { ...allocation, deliverable_id:'other' }] }, 'copy'));
  assert.throws(() => arbiterChainTarget(parseScopedChain({ ...snapshot, events:[{ ...event, index:1 }] }, 'copy')));
  assert.throws(() => arbiterChainTarget(parseScopedChain({ ...snapshot, events:[] }, 'copy')));
});
