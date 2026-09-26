export type Deliverable = {
  id: string; title: string; criteria: string; amount_base_units: string;
  revision_limit: number; review_period_hours: number;
};
export type Manifest = {
  version: number; chain_id: number; buyer: string; title: string;
  source: Record<string, string>; worker: string; primary_arbiter: string;
  backup_arbiter: string; delivery_deadline: string; deliverables: Deliverable[];
  total_base_units: string; invite_expires_at: string;
  primary_arbiter_hours: number; backup_arbiter_hours: number;
};
export type Task = {
  id: string; status: 'invited' | 'cancelled' | 'accepted_unfunded';
  manifest: Manifest; manifest_hash: string; created_at: string; invite_expires_at: string;
};
export type PublicWorkspaceConfig = {
  enabled: boolean; reason: string | null;
  chain: { id: number; name: string; rpcUrl: string; explorerUrl: string | null;
    escrowAddress: string | null;
    nativeCurrency: { name: string; symbol: string; decimals: number } } | null;
  walletConnectProjectId: string | null; arbiters: string[];
};
export const walletAddressPattern = /^0x[0-9a-fA-F]{40}$/;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isText = (value: unknown): value is string => typeof value === 'string';
const isDate = (value: unknown): value is string => isText(value) && Number.isFinite(Date.parse(value));
export function parseTask(value: unknown): Task {
  if (!value || typeof value !== 'object') throw new Error('Invalid task response.');
  const task = value as Task;
  const manifest = task.manifest;
  if (!uuidPattern.test(task.id) || !['invited', 'cancelled', 'accepted_unfunded'].includes(task.status)
    || !/^[a-f0-9]{64}$/.test(task.manifest_hash) || !isDate(task.created_at) || !isDate(task.invite_expires_at)
    || !manifest || manifest.version !== 1 || !Number.isSafeInteger(manifest.chain_id) || manifest.chain_id <= 0
    || ![manifest.buyer, manifest.worker, manifest.primary_arbiter, manifest.backup_arbiter].every(address => isText(address) && walletAddressPattern.test(address))
    || !isText(manifest.title) || !isDate(manifest.delivery_deadline) || !isDate(manifest.invite_expires_at)
    || !isText(manifest.total_base_units) || !/^[1-9][0-9]{0,77}$/.test(manifest.total_base_units)
    || manifest.primary_arbiter_hours !== 48 || manifest.backup_arbiter_hours !== 48
    || !manifest.source || typeof manifest.source !== 'object' || Array.isArray(manifest.source)
    || Object.keys(manifest.source).length > 100 || !Object.values(manifest.source).every(isText)
    || !Array.isArray(manifest.deliverables) || manifest.deliverables.length < 1 || manifest.deliverables.length > 10
    || !manifest.deliverables.every(item => item && isText(item.id) && isText(item.title) && isText(item.criteria)
      && isText(item.amount_base_units) && /^[1-9][0-9]{0,77}$/.test(item.amount_base_units)
      && Number.isInteger(item.revision_limit) && item.revision_limit >= 0 && item.revision_limit <= 5
      && Number.isInteger(item.review_period_hours) && item.review_period_hours >= 24 && item.review_period_hours <= 168)) {
    throw new Error('Invalid task response.');
  }
  return { id: task.id, status: task.status, manifest_hash: task.manifest_hash,
    created_at: task.created_at, invite_expires_at: task.invite_expires_at,
    manifest: { version: manifest.version, chain_id: manifest.chain_id, buyer: manifest.buyer,
      title: manifest.title, source: Object.fromEntries(Object.entries(manifest.source)), worker: manifest.worker,
      primary_arbiter: manifest.primary_arbiter, backup_arbiter: manifest.backup_arbiter,
      delivery_deadline: manifest.delivery_deadline, total_base_units: manifest.total_base_units,
      invite_expires_at: manifest.invite_expires_at, primary_arbiter_hours: manifest.primary_arbiter_hours,
      backup_arbiter_hours: manifest.backup_arbiter_hours,
      deliverables: manifest.deliverables.map(item => ({ id: item.id, title: item.title, criteria: item.criteria,
        amount_base_units: item.amount_base_units, revision_limit: item.revision_limit, review_period_hours: item.review_period_hours })) } };
}
