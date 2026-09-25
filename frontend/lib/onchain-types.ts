import { isAddress, zeroAddress } from 'viem';
import { parseScopedChain, type ScopedChain } from './arbiter-chain.ts';
import { uuidPattern, type Deliverable } from './workspace-types.ts';
import { parseDeliveryHistory, type DeliveryHistory } from './delivery-types.ts';

export type OnchainConfig = { enabled: boolean; chain_id: string; escrow_address: string; confirmations: number; attestation_available: boolean };
export type RevisionEligibility = { deliverable_id: string; index: number; state: string; round: string; local_version: number; next_local_submission: boolean; evidence_matches: boolean };
export type ChainBinding = { task_id: string; chain_id: string; escrow_address: string; onchain_task_id: string; transaction_hash: string; block_number: string; block_hash: string; manifest_digest: string; lifecycle?: { task_state: string; block_number: string; block_hash: string; allocations: RevisionEligibility[] } };
export type Availability = { task_id: string; deliverable_id: string; onchain_task_id: string; index: number; round: string; artifact_hash: string; manifest_digest: string; expiry: string; digest: string; signature: string; chain_id: string; escrow_address: string };
export type ArbiterCase = { task_id: string; deliverable_id: string; manifest_hash: string; version: number; artifact_hash: string; created_at: string };
export type ArbiterQueue = { disputes: ArbiterCase[]; next_cursor: string | null };
export type ArbiterEvidence = { task_id: string; deliverable_id: string; manifest_hash: string; deliverable: Deliverable; source: Record<string, string>; delivery: DeliveryHistory; onchain?: ScopedChain | null };
function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Invalid settlement response.'); return v as Record<string, unknown>; }
function text(v: unknown, re: RegExp): string { if (typeof v !== 'string' || !re.test(v) || /[\r\n]/.test(v)) throw Error('Invalid settlement value.'); return v; }
const decimal = (v: unknown) => text(v, /^(0|[1-9][0-9]{0,77})$/);
const hash = (v: unknown) => text(v, /^0x[0-9a-fA-F]{64}$/);
const fingerprint = (v: unknown) => text(v, /^[a-f0-9]{64}$/);
const uuid = (v: unknown) => text(v, uuidPattern);
const slug = (v: unknown) => { const s = text(v, /^[a-z0-9]+(?:-[a-z0-9]+)*$/); if (s.length > 64) throw Error('Invalid deliverable.'); return s; };
function address(v: unknown): string { if (typeof v !== 'string' || !isAddress(v) || v.toLowerCase() === zeroAddress) throw Error('Invalid escrow.'); return v; }
function integer(v: unknown, min: number, max: number): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) throw Error('Invalid integer.'); return v; }
function bounded(v: unknown, max: number): string { if (typeof v !== 'string' || v.length > max) throw Error('Invalid text.'); return v; }
export function parseOnchainConfig(v: unknown): OnchainConfig {
  const o = object(v);
  if (typeof o.enabled !== 'boolean' || typeof o.attestation_available !== 'boolean' || (!o.enabled && (o.escrow_address !== '' || o.attestation_available))) throw Error('Invalid deployment configuration.');
  return { enabled: o.enabled, chain_id: decimal(o.chain_id), escrow_address: o.enabled ? address(o.escrow_address) : '', confirmations: integer(o.confirmations, o.enabled ? 1 : 0, 256), attestation_available: o.attestation_available };
}
export function parseBinding(v: unknown): ChainBinding {
  const o = object(v);
  let lifecycle: ChainBinding['lifecycle'];
  if (o.lifecycle !== undefined) {
    const l = object(o.lifecycle);
    if (!Array.isArray(l.allocations) || l.allocations.length > 10) throw Error('Invalid lifecycle.');
    lifecycle = { task_state: text(l.task_state, /^(awaiting_worker|accepted_unfunded|funded|completed)$/), block_number: decimal(l.block_number), block_hash: hash(l.block_hash), allocations: l.allocations.map((value, index) => {
      const a = object(value);
      if (a.index !== index || typeof a.next_local_submission !== 'boolean' || typeof a.evidence_matches !== 'boolean') throw Error('Invalid lifecycle allocation.');
      return { deliverable_id: slug(a.deliverable_id), index, state: text(a.state, /^(awaiting_submission|in_review|disputed|settled)$/), round: decimal(a.round), local_version: integer(a.local_version, 0, 6), next_local_submission: a.next_local_submission, evidence_matches: a.evidence_matches };
    }) };
  }
  return { task_id: uuid(o.task_id), chain_id: decimal(o.chain_id), escrow_address: address(o.escrow_address), onchain_task_id: decimal(o.onchain_task_id), transaction_hash: hash(o.transaction_hash), block_number: decimal(o.block_number), block_hash: hash(o.block_hash), manifest_digest: hash(o.manifest_digest), ...(lifecycle ? { lifecycle } : {}) };
}
export function parseAvailability(v: unknown): Availability {
  const o = object(v);
  const signature = text(o.signature, /^0x(?:[0-9a-fA-F]{2})+$/);
  if (signature.length > 16386) throw Error('Invalid signature length.');
  return { task_id: uuid(o.task_id), deliverable_id: slug(o.deliverable_id), onchain_task_id: decimal(o.onchain_task_id), index: integer(o.index, 0, 9), round: decimal(o.round), artifact_hash: fingerprint(o.artifact_hash), manifest_digest: hash(o.manifest_digest), expiry: decimal(o.expiry), digest: hash(o.digest), signature, chain_id: decimal(o.chain_id), escrow_address: address(o.escrow_address) };
}
export function parseArbiterQueue(v: unknown): ArbiterQueue {
  const o = object(v);
  if (!Array.isArray(o.disputes) || o.disputes.length > 50 || !(o.next_cursor === null || (typeof o.next_cursor === 'string' && /^[\x21-\x7e]{1,1024}$/.test(o.next_cursor)))) throw Error('Invalid dispute queue.');
  return { disputes: o.disputes.map(v => {
    const c = object(v); const created_at = bounded(c.created_at, 40);
    if (!Number.isFinite(Date.parse(created_at))) throw Error('Invalid timestamp.');
    return { task_id: uuid(c.task_id), deliverable_id: slug(c.deliverable_id), manifest_hash: fingerprint(c.manifest_hash), version: integer(c.version, 0, 6), artifact_hash: c.version === 0 && c.artifact_hash === '' ? '' : fingerprint(c.artifact_hash), created_at };
  }), next_cursor: o.next_cursor };
}
export function parseArbiterEvidence(v: unknown): ArbiterEvidence {
  const o = object(v), d = object(o.deliverable);
  const delivery = parseDeliveryHistory(o.delivery);
  const onchain = o.onchain == null ? null : parseScopedChain(o.onchain, slug(o.deliverable_id));
  const result = { task_id: uuid(o.task_id), deliverable_id: slug(o.deliverable_id), manifest_hash: fingerprint(o.manifest_hash),
    deliverable: { id: slug(d.id), title: bounded(d.title, 1000), criteria: bounded(d.criteria, 16384), amount_base_units: decimal(d.amount_base_units), revision_limit: integer(d.revision_limit, 0, 5), review_period_hours: integer(d.review_period_hours, 24, 168) },
    source: Object.fromEntries(Object.entries(object(o.source)).map(([k, v]) => [bounded(k, 160), bounded(v, 16384)])), delivery, onchain };
  if (Object.keys(result.source).length > 100 || (!(delivery.state === 'disputed' && delivery.disputes.length === 1) && onchain?.allocations[0].state !== 'disputed') || delivery.task_id !== result.task_id || delivery.deliverable_id !== result.deliverable_id || result.deliverable.id !== result.deliverable_id || delivery.manifest_hash !== result.manifest_hash) throw Error('Mismatched dispute evidence.');
  return result;
}
export function parseSettlementResponse(path: string, value: unknown) {
  if (path === '/onchain/config') return parseOnchainConfig(value);
  if (path === '/arbiter/disputes') return parseArbiterQueue(value);
  const parts = path.split('/');
  if (path.startsWith('/arbiter/tasks/')) {
    const evidence = parseArbiterEvidence(value);
    if (evidence.task_id !== parts[3] || evidence.deliverable_id !== parts[5]) throw Error('Wrong evidence target.');
    return evidence;
  }
  if (path.endsWith('/availability')) {
    const receipt = parseAvailability(value);
    if (receipt.task_id !== parts[2] || receipt.deliverable_id !== parts[4]) throw Error('Wrong receipt target.');
    return receipt;
  }
  const binding = parseBinding(value);
  if (binding.task_id !== parts[2]) throw Error('Wrong binding target.');
  return binding;
}
