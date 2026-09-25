import { encodeFunctionData, type Address, type Hex, type PublicClient } from 'viem';
import { escrowAbi, createArguments, assertDeployment } from './onchain-contract.ts';
import { workspaceRequest, WorkspaceError } from './workspace-client.ts';
import type { Task } from './workspace-types.ts';
import type { Availability, ChainBinding, OnchainConfig } from './onchain-types.ts';
import type { Agreement } from './onchain-agreement.ts';

export type ChainAction = 'createTask' | 'acceptTask' | 'fundTask' | 'submitDeliverable' | 'acceptDeliverable' | 'requestRevision' | 'openDispute' | 'claimTimeout' | 'refundUnsubmitted' | 'handoverDispute' | 'resolveDispute' | 'withdraw' | 'settleByAgreement';
export type ReviewEvidence = Readonly<{ round: bigint; artifactHash: Hex; submittedAt: bigint }>;
export type ChainIntent = { action: ChainAction; index?: number; workerAmount?: bigint; artifactHash?: string; artifactVersion?: number; expectedBalance?: bigint; agreement?: Agreement; reviewEvidence?: ReviewEvidence };
export function isReviewAction(action: ChainAction): action is 'acceptDeliverable' | 'requestRevision' | 'openDispute' {
  return action === 'acceptDeliverable' || action === 'requestRevision' || action === 'openDispute';
}
// Copy primitives from the displayed confirmed snapshot; never retain a mutable allocation.
export function freezeReviewEvidence(allocation: NonNullable<VerifiedTask>['allocations'][number]): ReviewEvidence {
  if (allocation.status !== 1 || !allocation.everSubmitted || !/^0x[0-9a-fA-F]{64}$/.test(allocation.artifactHash) || /^0x0{64}$/.test(allocation.artifactHash)) throw Error('Confirmed review evidence required.');
  return Object.freeze({ round: BigInt(allocation.revisionsUsed) + BigInt(1), artifactHash: allocation.artifactHash, submittedAt: allocation.submittedAt });
}
export function assertReviewEvidence(allocation: NonNullable<VerifiedTask>['allocations'][number], expected: ReviewEvidence | undefined) {
  if (!expected) throw Error('Explicit review evidence consent required.');
  const current = freezeReviewEvidence(allocation);
  if (expected.round !== current.round || !same(expected.artifactHash, current.artifactHash) || expected.submittedAt !== current.submittedAt) throw Error('Review evidence changed. Refresh and review the new round before confirming again.');
}
export type VerifiedTask = Awaited<ReturnType<typeof readVerifiedTask>>;
export type TransactionCall = { to: Address; data: Hex; value: bigint; account: Address; chainId: number };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function assertReceiptTransaction(call: TransactionCall, tx: { to: string | null; from: string; input: string; value: bigint }) {
  if (!tx.to || !same(tx.to, call.to) || !same(tx.from, call.account) || !same(tx.input, call.data) || tx.value !== call.value) throw Error('Receipt is not for the confirmed contract action.');
}
export async function verifyDeployment(client: PublicClient, expected: OnchainConfig, sessionChain: number, walletChain: number | undefined) {
  const fresh = await workspaceRequest<OnchainConfig>('/onchain/config');
  if (JSON.stringify(fresh) !== JSON.stringify(expected)) throw Error('Deployment configuration changed.');
  const [rpcChain, code] = await Promise.all([client.getChainId(), client.getCode({ address: fresh.escrow_address as Address })]);
  assertDeployment(fresh, sessionChain, walletChain, rpcChain, code);
}
export async function readVerifiedTask(client: PublicClient, config: OnchainConfig, task: Task, latest = false) {
  const address = config.escrow_address as Address;
  let binding: ChainBinding;
  try { binding = await workspaceRequest<ChainBinding>(`/tasks/${task.id}/onchain`); }
  catch (error) { if (error instanceof WorkspaceError && error.status === 404) return null; throw error; }
  if (binding.task_id !== task.id || binding.chain_id !== config.chain_id || !same(binding.escrow_address, address)) throw Error('Wrong chain binding.');
  const id = BigInt(binding.onchain_task_id), args = createArguments(task);
  // Never reuse the pre-send cached head for receipt readback or financial controls.
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const confirmedNumber = latest ? head : head - BigInt(config.confirmations - 1);
  if (confirmedNumber < BigInt(0)) throw Error('No confirmed block.');
  const block = await client.getBlock({ blockNumber: confirmedNumber });
  const blockNumber = block.number;
  const [state, manifest, digest] = await Promise.all([
    client.readContract({ address, abi: escrowAbi, functionName: 'getTask', args: [id], blockNumber }),
    client.readContract({ address, abi: escrowAbi, functionName: 'getTaskManifest', args: [id], blockNumber }),
    client.readContract({ address, abi: escrowAbi, functionName: 'manifestDigest', args: [task.manifest.buyer as Address, ...args], blockNumber }),
  ]);
  const participants = [task.manifest.buyer, ...args.slice(0, 3)] as string[];
  if (!participants.every((p, i) => same(p, state[i] as string)) || !same(state[4], digest) || !same(binding.manifest_digest, digest) || state[5] !== BigInt(task.manifest.chain_id) || state[7] !== BigInt(args[6].length) || manifest[0] !== args[4] || !same(manifest[1], args[5])) throw Error('Chain terms differ from accepted manifest.');
  const allocations = await Promise.all(args[6].map(async (expected, index) => {
    const [d, evidence] = await Promise.all([
      client.readContract({ address, abi: escrowAbi, functionName: 'getDeliverable', args: [id, BigInt(index)], blockNumber }),
      client.readContract({ address, abi: escrowAbi, functionName: 'getDeliveryEvidence', args: [id, BigInt(index)], blockNumber }),
    ]);
    if (d[0] !== expected.amount || d[1] !== expected.revisionLimit || d[2] !== expected.reviewWindow || evidence[0] !== expected.deliveryDeadline) throw Error('Allocation terms mismatch.');
    return { amount: d[0], status: d[3], revisionsUsed: d[4], submittedAt: d[5], disputeOpenedAt: d[6], handoverAt: d[7], workerAward: d[8], buyerRefund: d[9], deadline: evidence[0], everSubmitted: evidence[1], artifactHash: evidence[2] };
  }));
  const canonical = await client.getBlock({ blockNumber });
  if (canonical.hash !== block.hash) throw Error('Chain snapshot was reorganized.');
  return { binding, state, allocations, timestamp: block.timestamp, blockNumber, blockHash: block.hash };
}
export function assertTaskReadback(current: NonNullable<VerifiedTask>, intent: ChainIntent) {
  const state = current.state[6];
  if (intent.action === 'acceptTask' && state < 1 || intent.action === 'fundTask' && state < 2) throw Error('Task transition not observed.');
  if (intent.index !== undefined) {
    const a = current.allocations[intent.index];
    if (!a) throw Error('Allocation not observed.');
    if (isReviewAction(intent.action)) {
      const e = intent.reviewEvidence;
      const revision = intent.action === 'requestRevision';
      if (!e || !same(a.artifactHash, e.artifactHash) || BigInt(a.revisionsUsed) + BigInt(1) !== e.round + (revision ? BigInt(1) : BigInt(0)) || a.submittedAt !== (revision ? BigInt(0) : e.submittedAt)) throw Error('Reviewed evidence transition not observed.');
    }
    if (intent.action === 'submitDeliverable' && (a.status !== 1 || a.artifactHash.toLowerCase() !== '0x' + intent.artifactHash)) throw Error('Submission not observed.');
    if (intent.action === 'requestRevision' && a.status !== 0 || intent.action === 'openDispute' && a.status !== 2 || intent.action === 'handoverDispute' && a.handoverAt === BigInt(0)) throw Error('Allocation transition not observed.');
    if (['acceptDeliverable', 'claimTimeout'].includes(intent.action) && (a.status !== 3 || a.workerAward !== a.amount || a.buyerRefund !== BigInt(0))) throw Error('Worker allocation not observed.');
    if (intent.action === 'refundUnsubmitted' && (a.status !== 3 || a.workerAward !== BigInt(0) || a.buyerRefund !== a.amount)) throw Error('Refund not observed.');
    if (intent.action === 'settleByAgreement' && (!intent.agreement || a.status !== 3 || a.workerAward !== BigInt(intent.agreement.message.workerAmount) || a.buyerRefund !== a.amount - BigInt(intent.agreement.message.workerAmount))) throw Error('Bilateral allocation not observed.');
  }
}
export async function prepareTaskCall(client: PublicClient, config: OnchainConfig, task: Task, actor: Address, intent: ChainIntent): Promise<TransactionCall> {
  const args = createArguments(task), to = config.escrow_address as Address;
  const current = await readVerifiedTask(client, config, task);
  let data: Hex, value = BigInt(0);
  if (intent.action === 'createTask') {
    if (current || !same(actor, task.manifest.buyer)) throw Error('Creation unavailable.');
    const digest = await client.readContract({ address: to, abi: escrowAbi, functionName: 'manifestDigest', args: [actor, ...args] });
    if (await client.readContract({ address: to, abi: escrowAbi, functionName: 'boundManifests', args: [digest] })) throw Error('Already created. Reconcile the creation receipt instead.');
    data = encodeFunctionData({ abi: escrowAbi, functionName: 'createTask', args });
  } else {
    if (!current) throw Error('Verified binding required.');
    const id = BigInt(current.binding.onchain_task_id);
    if (intent.action === 'acceptTask' || intent.action === 'fundTask') {
      if (!same(actor, intent.action === 'acceptTask' ? task.manifest.worker : task.manifest.buyer) || current.state[6] !== (intent.action === 'acceptTask' ? 0 : 1)) throw Error('Wrong role or task state.');
      data = encodeFunctionData({ abi: escrowAbi, functionName: intent.action, args: [id] });
      if (intent.action === 'fundTask') value = BigInt(task.manifest.total_base_units);
    } else if (intent.action === 'withdraw') {
      const balance = await client.readContract({ address: to, abi: escrowAbi, functionName: 'balances', args: [actor] });
      if (intent.expectedBalance === undefined || balance <= BigInt(0) || balance !== intent.expectedBalance) throw Error('Withdrawal balance changed or not confirmed.');
      data = encodeFunctionData({ abi: escrowAbi, functionName: 'withdraw' });
    } else {
      const index = intent.index;
      if (index === undefined || !Number.isInteger(index) || !current.allocations[index]) throw Error('Invalid allocation index.');
      if (intent.action === 'submitDeliverable') {
        if (!config.attestation_available || !same(actor, task.manifest.worker)) throw Error('Availability service or worker role missing.');
        if (!intent.artifactHash || !intent.artifactVersion) throw Error('Explicit artifact consent required.');
        const path = `/tasks/${task.id}/deliverables/${task.manifest.deliverables[index].id}`;
        const { parseDeliveryHistory } = await import('./delivery-types.ts');
        const history = parseDeliveryHistory(await workspaceRequest(path + '/submissions'));
        if (history.latest_artifact_hash !== intent.artifactHash || history.latest_version !== intent.artifactVersion) throw Error('Persisted artifact changed after consent.');
        const receipt = await workspaceRequest<Availability>(path + '/onchain/availability', { method: 'POST', body: JSON.stringify({ artifact_hash: history.latest_artifact_hash, expected_version: history.latest_version }) });
        if (receipt.index !== index || receipt.onchain_task_id !== current.binding.onchain_task_id || receipt.chain_id !== config.chain_id || !same(receipt.escrow_address, to) || !same(receipt.manifest_digest, current.binding.manifest_digest) || receipt.artifact_hash !== history.latest_artifact_hash || BigInt(receipt.round) !== BigInt(current.allocations[index].revisionsUsed + 1)) throw Error('Availability receipt does not match current artifact and round.');
        const artifact = ('0x' + receipt.artifact_hash) as Hex;
        const digest = await client.readContract({ address: to, abi: escrowAbi, functionName: 'submissionDigest', args: [id, BigInt(index), BigInt(receipt.round), artifact, BigInt(receipt.expiry)] });
        if (!same(digest, receipt.digest)) throw Error('Attestation digest mismatch.');
        data = encodeFunctionData({ abi: escrowAbi, functionName: 'submitDeliverable', args: [id, BigInt(index), artifact, BigInt(receipt.expiry), receipt.signature as Hex] });
      } else if (isReviewAction(intent.action)) {
        assertReviewEvidence(current.allocations[index], intent.reviewEvidence);
        // Confirmed display state alone can lag a new submission. Re-read the
        // uncached head immediately before simulation and the wallet prompt.
        const latest = await readVerifiedTask(client, config, task, true);
        if (!latest || latest.binding.onchain_task_id !== current.binding.onchain_task_id) throw Error('Review binding changed.');
        assertReviewEvidence(latest.allocations[index], intent.reviewEvidence);
        const evidence = intent.reviewEvidence!;
        data = encodeFunctionData({ abi: escrowAbi, functionName: intent.action, args: [id, BigInt(index), evidence.round, evidence.artifactHash, evidence.submittedAt] });
      } else if (intent.action === 'settleByAgreement') {
        if (!intent.agreement) throw Error('Explicit bilateral consent required.');
        const { validateAgreement } = await import('./onchain-agreement.ts');
        const p = await validateAgreement(client, config, task, index, intent.agreement, true);
        data = encodeFunctionData({ abi: escrowAbi, functionName: 'settleByAgreement', args: [id, BigInt(index), BigInt(p.message.workerAmount), BigInt(p.message.expiry), p.buyerSignature!, p.workerSignature!] });
      } else if (intent.action === 'resolveDispute') {
        if (intent.workerAmount === undefined || intent.workerAmount < BigInt(0) || intent.workerAmount > current.allocations[index].amount) throw Error('Invalid allocation split.');
        data = encodeFunctionData({ abi: escrowAbi, functionName: 'resolveDispute', args: [id, BigInt(index), intent.workerAmount] });
      } else {
        data = encodeFunctionData({ abi: escrowAbi, functionName: intent.action, args: [id, BigInt(index)] });
      }
    }
  }
  // eth_call exercises the actual contract's role, window, status and signature checks.
  await client.call({ account: actor, to, data, value });
  return { to, data, value, account: actor, chainId: Number(config.chain_id) };
}
