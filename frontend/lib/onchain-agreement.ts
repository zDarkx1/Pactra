import { encodeFunctionData, hashDomain, hashTypedData, recoverTypedDataAddress, type Address, type Hex, type PublicClient } from 'viem';
import { escrowAbi, allocationSplit } from './onchain-contract.ts';
import { readVerifiedTask } from './onchain-service.ts';
import type { OnchainConfig } from './onchain-types.ts';
import type { Task } from './workspace-types.ts';

export const settlementTypes = { Settlement: [
  { name: 'taskId', type: 'uint256' }, { name: 'index', type: 'uint256' },
  { name: 'manifestHash', type: 'bytes32' }, { name: 'workerAmount', type: 'uint128' },
  { name: 'nonce', type: 'uint256' }, { name: 'expiry', type: 'uint64' },
] } as const;
const domainTypes = { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }] } as const;
export type Agreement = {
  format: 'pactra-settlement-v2';
  domain: { name: 'PactraEscrow'; version: '2'; chainId: string; verifyingContract: Address };
  message: { taskId: string; index: string; manifestHash: Hex; workerAmount: string; nonce: string; expiry: string };
  buyerSignature: Hex | null; workerSignature: Hex | null;
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function uint(value: unknown, bits: number): string {
  if (typeof value !== 'string' || /[^0-9]/.test(value) || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= BigInt(2) ** BigInt(bits)) throw Error('Use canonical unsigned integer base units / Unix seconds.');
  return value;
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys.sort().join(',')) throw Error('Unexpected agreement fields. Paste an exported agreement, not a private key.');
  return value as Record<string, unknown>;
}
function signature(value: unknown): Hex | null {
  if (value === null) return null;
  if (typeof value !== 'string' || /\s/.test(value) || !/^0x(?:[a-fA-F0-9]{2})+$/.test(value) || value.length > 16386) throw Error('Invalid signature bytes.');
  return value as Hex;
}
export function parseAgreement(raw: string): Agreement {
  if (raw.length > 40000) throw Error('Agreement is too large.');
  const p = object(JSON.parse(raw), ['format', 'domain', 'message', 'buyerSignature', 'workerSignature']);
  const d = object(p.domain, ['name', 'version', 'chainId', 'verifyingContract']);
  const m = object(p.message, ['taskId', 'index', 'manifestHash', 'workerAmount', 'nonce', 'expiry']);
  if (p.format !== 'pactra-settlement-v2' || d.name !== 'PactraEscrow' || d.version !== '2' || typeof d.verifyingContract !== 'string' || d.verifyingContract.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(d.verifyingContract) || typeof m.manifestHash !== 'string' || m.manifestHash.length !== 66 || !/^0x[0-9a-fA-F]{64}$/.test(m.manifestHash)) throw Error('Wrong settlement domain or manifest format.');
  return { format: p.format, domain: { name: d.name, version: d.version, chainId: uint(d.chainId, 256), verifyingContract: d.verifyingContract as Address }, message: { taskId: uint(m.taskId, 256), index: uint(m.index, 256), manifestHash: m.manifestHash as Hex, workerAmount: uint(m.workerAmount, 128), nonce: uint(m.nonce, 256), expiry: uint(m.expiry, 64) }, buyerSignature: signature(p.buyerSignature), workerSignature: signature(p.workerSignature) };
}
export function agreementTypedData(p: Agreement) {
  return { domain: { ...p.domain, chainId: BigInt(p.domain.chainId) }, types: settlementTypes, primaryType: 'Settlement' as const,
    message: { taskId: BigInt(p.message.taskId), index: BigInt(p.message.index), manifestHash: p.message.manifestHash, workerAmount: BigInt(p.message.workerAmount), nonce: BigInt(p.message.nonce), expiry: BigInt(p.message.expiry) } };
}
export function serializeAgreement(p: Agreement) { return JSON.stringify(p, null, 2); }
export function expiryUTC(seconds: string) {
  const ms = BigInt(seconds) * BigInt(1000);
  return ms <= BigInt(8640000000000000) ? new Date(Number(ms)).toISOString() : 'Outside JavaScript calendar range; use exact Unix seconds';
}
async function agreementContext(client: PublicClient, config: OnchainConfig, task: Task, index: number, workerAmount: string, expiry: string) {
  uint(workerAmount, 128); uint(expiry, 64);
  if (!Number.isSafeInteger(index) || index < 0) throw Error('Invalid allocation index.');
  if (await client.getChainId() !== Number(config.chain_id)) throw Error('Wrong RPC chain.');
  // Signing/relay must see latest state, not only a confirmation-delayed snapshot.
  const current = await readVerifiedTask(client, config, task, true);
  const a = current?.allocations[index];
  if (!current || !a || current.state[6] !== 2 || a.status !== 2 || a.handoverAt === BigInt(0) || current.timestamp <= a.handoverAt + BigInt(172800)) throw Error('Requires a funded dispute strictly after recorded backup handover plus 48 hours.');
  if (BigInt(expiry) < current.timestamp) throw Error('Agreement expired at current chain time.');
  allocationSplit(String(a.amount), workerAmount);
  const address = config.escrow_address as Address, taskId = BigInt(current.binding.onchain_task_id), blockNumber = current.blockNumber;
  const [nonce, domain, digest, window] = await Promise.all([
    client.readContract({ address, abi: escrowAbi, functionName: 'settlementNonces', args: [taskId, BigInt(index)], blockNumber }),
    client.readContract({ address, abi: escrowAbi, functionName: 'domainSeparator', blockNumber }),
    client.readContract({ address, abi: escrowAbi, functionName: 'settlementDigest', args: [taskId, BigInt(index), BigInt(workerAmount), BigInt(expiry)], blockNumber }),
    client.readContract({ address, abi: escrowAbi, functionName: 'ARBITER_WINDOW', blockNumber }),
  ]);
  const proposal: Agreement = { format: 'pactra-settlement-v2', domain: { name: 'PactraEscrow', version: '2', chainId: config.chain_id, verifyingContract: address }, message: { taskId: String(taskId), index: String(index), manifestHash: current.binding.manifest_digest as Hex, workerAmount, nonce: String(nonce), expiry }, buyerSignature: null, workerSignature: null };
  const typed = agreementTypedData(proposal);
  if (window !== BigInt(172800) || !same(hashDomain({ domain: typed.domain, types: domainTypes }), domain) || !same(hashTypedData(typed), digest)) throw Error('Contract EIP-712 domain / settlement digest mismatch.');
  return { current, proposal, digest, blockNumber };
}
async function canonical(client: PublicClient, context: Awaited<ReturnType<typeof agreementContext>>) {
  if ((await client.getBlock({ blockNumber: context.blockNumber })).hash !== context.current.blockHash) throw Error('Agreement snapshot reorganized.');
}
export async function createAgreement(client: PublicClient, config: OnchainConfig, task: Task, index: number, workerAmount: string, expiry: string) {
  const context = await agreementContext(client, config, task, index, workerAmount, expiry);
  await canonical(client, context);
  return context.proposal;
}
export async function verifyAgreementSigner(client: PublicClient, p: Agreement, signer: Address, sig: Hex, blockNumber: bigint) {
  const code = await client.getCode({ address: signer, blockNumber });
  if (code && code !== '0x') {
    // Match the escrow's full 32-byte ERC-1271 result, not a permissive bytes4 decoder.
    const data = encodeFunctionData({ abi: [{ type: 'function', name: 'isValidSignature', stateMutability: 'view', inputs: [{ type: 'bytes32' }, { type: 'bytes' }], outputs: [{ type: 'bytes4' }] }], functionName: 'isValidSignature', args: [hashTypedData(agreementTypedData(p)), sig] });
    const result = await client.call({ account: p.domain.verifyingContract, to: signer, data, blockNumber });
    if (!result.data || result.data.slice(0, 66).toLowerCase() !== '0x1626ba7e' + '0'.repeat(56)) throw Error('ERC-1271 signer rejected agreement.');
  } else {
    if (!/^0x[0-9a-fA-F]{130}$/.test(sig) || !['1b', '1c'].includes(sig.slice(-2).toLowerCase()) || BigInt('0x' + sig.slice(66, 130)) > BigInt('0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0')) throw Error('EOA signature must be canonical 65-byte low-s, v=27/28.');
    const recovered = await recoverTypedDataAddress({ ...agreementTypedData(p), signature: sig });
    if (!same(recovered, signer)) throw Error('Recovered signer is not the required party.');
  }
}
export async function validateAgreement(client: PublicClient, config: OnchainConfig, task: Task, index: number, input: Agreement, requireBoth = false) {
  const p = parseAgreement(serializeAgreement(input));
  const context = await agreementContext(client, config, task, index, p.message.workerAmount, p.message.expiry);
  if (hashTypedData(agreementTypedData(p)) !== context.digest || p.message.index !== String(index)) throw Error('Agreement domain, task, index, manifest or nonce differs from current chain state.');
  if (requireBoth && (!p.buyerSignature || !p.workerSignature)) throw Error('Both buyer and worker signatures are required.');
  await Promise.all([
    p.buyerSignature && verifyAgreementSigner(client, p, context.current.state[0], p.buyerSignature, context.blockNumber),
    p.workerSignature && verifyAgreementSigner(client, p, context.current.state[1], p.workerSignature, context.blockNumber),
  ]);
  await canonical(client, context);
  return p;
}
