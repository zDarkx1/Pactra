// Synthetic RPC/backend state only. Cryptographic signatures are actual local viem signatures.
// Public deterministic test keys; never use these accounts for funds or production.
import { privateKeyToAccount } from 'viem/accounts';
import { encodeAbiParameters, keccak256, stringToHex, concatHex, type Hex, type PublicClient } from 'viem';
import type { Task } from '../lib/workspace-types.ts';
export const buyerAccount = privateKeyToAccount(('0x' + '1'.padStart(64, '0')) as Hex);
export const workerAccount = privateKeyToAccount(('0x' + '2'.padStart(64, '0')) as Hex);
export const outsiderAccount = privateKeyToAccount(('0x' + '3'.padStart(64, '0')) as Hex);
export const escrow = '0x5555555555555555555555555555555555555555';
export const manifestDigest = ('0x' + 'd'.repeat(64)) as Hex;
export const config = { enabled: true, chain_id: '31337', escrow_address: escrow, confirmations: 2, attestation_available: false };
export const task = { id: '11111111-1111-4111-8111-111111111111', status: 'accepted_unfunded', manifest_hash: 'a'.repeat(64), manifest: { buyer: buyerAccount.address, worker: workerAccount.address, primary_arbiter: '0x3333333333333333333333333333333333333333', backup_arbiter: '0x4444444444444444444444444444444444444444', chain_id: 31337, version: 1, delivery_deadline: '2027-01-01T00:00:00Z', total_base_units: '100', deliverables: [{ id: 'copy', title: 'Fixture allocation', amount_base_units: '100', revision_limit: 2, review_period_hours: 24 }] } } as Task;
export const binding = { task_id: task.id, chain_id: '31337', escrow_address: escrow, onchain_task_id: '7', transaction_hash: '0x' + 'b'.repeat(64), block_number: '10', block_hash: '0x' + 'c'.repeat(64), manifest_digest: manifestDigest };
const hash = (s: string) => keccak256(stringToHex(s));
export const domain = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }], [hash('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'), hash('PactraEscrow'), hash('2'), BigInt(31337), escrow]));
export function solidityDigest(taskId: bigint, index: bigint, amount: bigint, nonce: bigint, expiry: bigint) {
  const struct = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'uint128' }, { type: 'uint256' }, { type: 'uint64' }], [hash('Settlement(uint256 taskId,uint256 index,bytes32 manifestHash,uint128 workerAmount,uint256 nonce,uint64 expiry)'), taskId, index, manifestDigest, amount, nonce, expiry]));
  return keccak256(concatHex(['0x1901', domain, struct]));
}
export function rpcFixture() {
  const state = { timestamp: BigInt(400000), handover: BigInt(200000), status: 2, taskStatus: 2, nonce: BigInt(0), domain, digestMismatch: false, contractSigner: false, magic: ('0x1626ba7e' + '0'.repeat(56)) as Hex, reorg: false, rpcChain: 31337, revert: false };
  const calls: any[] = [], reads: any[] = [];
  let blocks = 0;
  const client = { getChainId: async () => state.rpcChain, getCode: async ({ address }: any) => address === escrow || state.contractSigner ? '0x6000' : undefined,
    getBlockNumber: async (p: any) => { reads.push({ method: 'getBlockNumber', ...p }); return BigInt(13); },
    getBlock: async ({ blockNumber }: any) => ({ number: blockNumber, timestamp: state.timestamp, hash: state.reorg && ++blocks > 2 ? '0x' + 'e'.repeat(64) : binding.block_hash }),
    readContract: async (p: any) => {
      reads.push(p);
      if (p.functionName === 'getTask') return [task.manifest.buyer, task.manifest.worker, task.manifest.primary_arbiter, task.manifest.backup_arbiter, manifestDigest, BigInt(31337), state.taskStatus, BigInt(1), BigInt(0)];
      if (p.functionName === 'getTaskManifest') return [BigInt(1), '0x' + task.manifest_hash];
      if (p.functionName === 'manifestDigest') return manifestDigest;
      if (p.functionName === 'getDeliverable') return [BigInt(100), 2, BigInt(86400), state.status, 0, BigInt(100), BigInt(100000), state.handover, state.status === 3 ? BigInt(60) : BigInt(0), state.status === 3 ? BigInt(40) : BigInt(0)];
      if (p.functionName === 'getDeliveryEvidence') return [BigInt(Date.parse(task.manifest.delivery_deadline) / 1000), true, '0x' + 'f'.repeat(64), BigInt(1000)];
      if (p.functionName === 'settlementNonces') return state.nonce;
      if (p.functionName === 'domainSeparator') return state.domain;
      if (p.functionName === 'ARBITER_WINDOW') return BigInt(172800);
      if (p.functionName === 'settlementDigest') return state.digestMismatch ? manifestDigest : solidityDigest(p.args[0], p.args[1], p.args[2], state.nonce, p.args[3]);
      if (p.functionName === 'balances') return BigInt(0);
      throw Error('Unexpected read: ' + p.functionName);
    }, call: async (p: any) => { calls.push(p); if (state.revert) throw Error('Simulated revert fixture'); return { data: state.magic }; },
  } as unknown as PublicClient;
  return { state, client, calls, reads };
}
