import { decodeEventLog, type Hex } from 'viem';
import { escrowAbi } from './escrow-abi.ts';
function obj(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Invalid chain evidence.'); return v as Record<string, unknown>; }
function text(v: unknown, re: RegExp): string { if (typeof v !== 'string' || !re.test(v) || /[\r\n]/.test(v)) throw Error('Invalid chain evidence field.'); return v; }
const decimal = (v: unknown) => text(v, /^(0|[1-9][0-9]{0,77})$/);
const hash = (v: unknown) => text(v, /^0x[0-9a-fA-F]{64}$/);
function number(v: unknown, max: number) { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > max) throw Error('Invalid index.'); return v; }
export function parseScopedChain(v: unknown, deliverable: string) {
  const o = obj(v);
  if (!Array.isArray(o.allocations) || o.allocations.length !== 1 || !Array.isArray(o.events) || o.events.length > 4096) throw Error('Chain evidence must be scoped to one allocation.');
  const a = obj(o.allocations[0]);
  if (a.deliverable_id !== deliverable) throw Error('Wrong allocation.');
  const allocation = { deliverable_id: deliverable, index: number(a.index, 9), state: text(a.state, /^(awaiting_submission|in_review|disputed|settled)$/), artifact_hash: hash(a.artifact_hash), dispute_opened_at: decimal(a.dispute_opened_at), handover_at: decimal(a.handover_at), worker_award: decimal(a.worker_award), buyer_refund: decimal(a.buyer_refund) };
  const events = o.events.map(value => {
    const e = obj(value);
    if (!Array.isArray(e.topics) || e.topics.length > 4) throw Error('Invalid event topics.');
    return { name: text(e.name, /^[A-Za-z]{1,64}$/), index: number(e.index, 9), transaction_hash: hash(e.transaction_hash), block_number: decimal(e.block_number), block_hash: hash(e.block_hash), log_index: decimal(e.log_index), data: text(e.data, /^0x(?:[a-fA-F0-9]{2}){0,1024}$/), topics: e.topics.map(hash) };
  });
  return { block_number: decimal(o.block_number), block_hash: hash(o.block_hash), timestamp: decimal(o.timestamp), task_state: text(o.task_state, /^(awaiting_worker|accepted_unfunded|funded|completed)$/), settled_count: decimal(o.settled_count), allocations: [allocation], events };
}
export type ScopedChain = ReturnType<typeof parseScopedChain>;
// Backend's receipt-linked DisputeOpened supplies the actual task/index, never an input field.
export function arbiterChainTarget(chain: ScopedChain) {
  const allocation = chain.allocations[0];
  const event = chain.events.find(e => e.name === 'DisputeOpened');
  if (!event || event.index !== allocation.index || allocation.state !== 'disputed') throw Error('No linked onchain dispute.');
  const decoded = decodeEventLog({ abi: escrowAbi, eventName: 'DisputeOpened', topics: event.topics as [Hex, ...Hex[]], data: event.data as Hex, strict: true });
  if (decoded.args.index !== BigInt(allocation.index) || decoded.args.openedAt !== BigInt(allocation.dispute_opened_at)) throw Error('Dispute event does not match allocation.');
  return { taskId: decoded.args.taskId, index: allocation.index };
}
