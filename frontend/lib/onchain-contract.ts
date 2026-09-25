import { isAddress, zeroAddress, type Address, type Hex } from 'viem';
import type { Task } from './workspace-types.ts';
import type { OnchainConfig } from './onchain-types.ts';
export { escrowAbi } from './escrow-abi.ts';
export function createArguments(task: Task) {
  const m = task.manifest;
  if (task.status !== 'accepted_unfunded' || !/^[a-f0-9]{64}$/.test(task.manifest_hash)) throw Error('Accepted immutable terms required.');
  const deadline = Date.parse(m.delivery_deadline);
  if (!Number.isSafeInteger(deadline) || deadline % 1000 !== 0 || /\.\d*[1-9]\d*(?:Z|[+-])/.test(m.delivery_deadline)) throw Error('Deadline must be whole seconds.');
  const configs = m.deliverables.map(d => {
    const amount = BigInt(d.amount_base_units);
    if (amount <= BigInt(0) || amount >= BigInt(2) ** BigInt(128)) throw Error('Allocation exceeds uint128.');
    return { amount, revisionLimit: d.revision_limit, reviewWindow: BigInt(d.review_period_hours) * BigInt(3600), deliveryDeadline: BigInt(deadline / 1000) };
  });
  if (configs.reduce((total, d) => total + d.amount, BigInt(0)) !== BigInt(m.total_base_units)) throw Error('Allocation total mismatch.');
  return [m.worker as Address, m.primary_arbiter as Address, m.backup_arbiter as Address, BigInt(m.chain_id), BigInt(m.version), ('0x' + task.manifest_hash) as Hex, configs] as const;
}
export function assertDeployment(config: OnchainConfig, sessionChain: number, walletChain: number | undefined, rpcChain: number, code: string | undefined) {
  if (!config.enabled || config.chain_id !== String(sessionChain) || walletChain !== sessionChain || rpcChain !== sessionChain || !isAddress(config.escrow_address) || config.escrow_address.toLowerCase() === zeroAddress || !code || code === '0x') throw Error('Deployment, wallet and session must match a contract with code.');
}
export function allocationSplit(total: string, worker: string) {
  if (!/^(0|[1-9][0-9]{0,38})$/.test(worker) || !/^[1-9][0-9]{0,38}$/.test(total)) throw Error('Use exact base units.');
  const amount = BigInt(total), award = BigInt(worker);
  if (amount >= BigInt(2) ** BigInt(128) || award > amount) throw Error('Split exceeds allocation.');
  return { worker: award, buyer: amount - award };
}
