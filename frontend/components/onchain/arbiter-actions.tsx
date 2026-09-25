'use client';
import { useEffect, useRef, useState } from 'react';
import { useConfig, usePublicClient, useSendTransaction } from 'wagmi';
import { getAccount } from 'wagmi/actions';
import { encodeFunctionData, type Address } from 'viem';
import { useWorkspace } from '../workspace-provider';
import { TaskButton, WorkspaceConfirmation, useTaskResource } from '../tasks/task-shared';
import styles from '../tasks/task-styles';
import type { ArbiterEvidence, OnchainConfig } from '../../lib/onchain-types';
import { readArbiterAuthority } from '../../lib/arbiter-service';
import { allocationSplit, escrowAbi } from '../../lib/onchain-contract';
import { assertReceiptTransaction, verifyDeployment, type TransactionCall } from '../../lib/onchain-service';
import { createTransactionAttempt } from '../../lib/onchain-transaction';
import { workspaceRequest } from '../../lib/workspace-client';

export function ArbiterActions({ evidence }: { evidence: ArbiterEvidence }) {
  const { data, loading, error } = useTaskResource<OnchainConfig>('/onchain/config');
  if (loading || error || !data?.enabled || !evidence.onchain) return <div className={styles.setupPanel}><p>{loading ? 'Checking settlement configuration…' : !evidence.onchain ? 'This case has no verified onchain dispute binding. Evidence review remains available.' : 'No verified deployment is available.'}</p><TaskButton className={styles.primary} disabled>Resolve allocation · setup required</TaskButton><TaskButton className={styles.secondary} disabled>Handover · setup required</TaskButton></div>;
  return <ConnectedArbiter evidence={evidence} deployment={data} />;
}
function ConnectedArbiter({ evidence, deployment }: { evidence: ArbiterEvidence; deployment: OnchainConfig }) {
  const workspace = useWorkspace(), wagmi = useConfig(), client = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const [authority, setAuthority] = useState<Awaited<ReturnType<typeof readArbiterAuthority>> | null>(null);
  const [award, setAward] = useState('');
  const [confirmation, setConfirmation] = useState<'resolveDispute' | 'handoverDispute' | null>(null);
  const [error, setError] = useState('');
  const [, render] = useState(0);
  const attempt = useRef<ReturnType<typeof createTransactionAttempt> | null>(null);
  const alive = useRef(true), reading = useRef(0);
  const actor = workspace.address as Address;
  const path = `/arbiter/tasks/${evidence.task_id}/deliverables/${evidence.deliverable_id}/evidence`;
  const phase = attempt.current?.snapshot.phase;
  const busy = phase && !['rejected','reverted','blocked','success','ready'].includes(phase);
  let split: ReturnType<typeof allocationSplit> | null = null;
  try { split = allocationSplit(evidence.deliverable.amount_base_units, award); } catch {}
  function identity() {
    const account = getAccount(wagmi);
    if (!alive.current || account.address?.toLowerCase() !== actor.toLowerCase() || account.chainId !== workspace.config.chain!.id) throw Error('Wallet changed.');
    return account;
  }
  async function read() {
    const generation = ++reading.current;
    setAuthority(null); setError('');
    try {
      if (!client) throw Error('No RPC.');
      const account = identity();
      await verifyDeployment(client, deployment, workspace.config.chain!.id, account.chainId);
      const fresh = await workspaceRequest<ArbiterEvidence>(path);
      const result = await readArbiterAuthority(client, deployment, fresh, actor);
      identity(); if (reading.current === generation) setAuthority(result);
    } catch { if (alive.current && reading.current === generation) setError('Authority or canonical dispute could not be verified. No financial action is available.'); }
  }
  useEffect(() => { alive.current = true; void read(); return () => { alive.current = false; reading.current++; attempt.current?.dispose(); }; }, []);
  async function act(action: 'resolveDispute' | 'handoverDispute') {
    if (!client || !authority || busy || (attempt.current && !['ready','rejected','reverted','blocked','success'].includes(attempt.current.snapshot.phase)) || (action === 'resolveDispute' && !split)) return;
    const reviewed = authority, reviewedSplit = split;
    setConfirmation(null); setError('');
    attempt.current?.dispose();
    const tx = createTransactionAttempt(() => { if (alive.current) render(n => n + 1); }); attempt.current = tx;
    let call: TransactionCall;
    await tx.send({ validate: async () => {
      const account = identity();
      await verifyDeployment(client, deployment, workspace.config.chain!.id, account.chainId);
      const fresh = await workspaceRequest<ArbiterEvidence>(path);
      if (fresh.manifest_hash !== evidence.manifest_hash || fresh.delivery.latest_artifact_hash !== evidence.delivery.latest_artifact_hash) throw Error('Evidence changed after confirmation.');
      const current = await readArbiterAuthority(client, deployment, fresh, actor);
      if (current.taskId !== reviewed.taskId || current.index !== reviewed.index || current.amount !== reviewed.amount || !(action === 'resolveDispute' ? current.canResolve : current.canHandover)) throw Error('Authority changed.');
      const data = action === 'resolveDispute' ? encodeFunctionData({ abi: escrowAbi, functionName: action, args: [current.taskId, BigInt(current.index), reviewedSplit!.worker] }) : encodeFunctionData({ abi: escrowAbi, functionName: action, args: [current.taskId, BigInt(current.index)] });
      call = { account: actor, to: deployment.escrow_address as Address, data, value: BigInt(0), chainId: workspace.config.chain!.id };
      await client.call(call); identity();
    }, send: async () => { identity(); return sendTransactionAsync(call); }, receipt: async hash => {
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 120000 });
      assertReceiptTransaction(call, await client.getTransaction({ hash: receipt.transactionHash })); return receipt;
    }, readback: async () => {
      identity();
      const allocation = await client.readContract({ address: deployment.escrow_address as Address, abi: escrowAbi, functionName: 'getDeliverable', args: [reviewed.taskId, BigInt(reviewed.index)] });
      if (action === 'resolveDispute' ? allocation[3] !== 3 || allocation[8] !== reviewedSplit!.worker || allocation[9] !== reviewedSplit!.buyer : allocation[7] === BigInt(0)) throw Error('State readback did not confirm action.');
      identity(); setAuthority(null);
    } });
  }
  return <section className={styles.setupPanel}><h3>Verified contract authority</h3><p>Chain {deployment.chain_id} · <code>{deployment.escrow_address}</code></p>
    {error && <p role="alert">{error}</p>}
    <TaskButton className={styles.secondary} disabled={!!busy} onClick={() => void read()}>Refresh contract authority</TaskButton>
    {authority && <><p>Your contract role: {authority.role} arbiter. Task {String(authority.taskId)}, allocation {authority.index}, read at block {String(authority.blockNumber)}.</p><p>Buyer <code>{authority.buyer}</code> · Worker <code>{authority.worker}</code></p><label className={styles.field}>Worker award · exact native base units<input inputMode="numeric" value={award} disabled={!!busy} onChange={e => setAward(e.target.value)} /></label><p>Allocation: {evidence.deliverable.amount_base_units} base units. Worker: {split?.worker.toString() ?? 'enter valid amount'}. Buyer refund: {split?.buyer.toString() ?? 'not calculated'}.</p><div className={styles.actions}><TaskButton className={styles.primary} disabled={!!busy || !authority.canResolve || !split} onClick={() => setConfirmation('resolveDispute')}>Resolve allocation</TaskButton><TaskButton className={styles.secondary} disabled={!!busy || !authority.canHandover} onClick={() => setConfirmation('handoverDispute')}>Record backup handover</TaskButton></div><p className={styles.hint}>Authority is checked against block time. Handover starts the backup window; it is not automatic. After both windows, funds remain locked without both parties’ signed settlement.</p></>}
    {phase && <div role="status" className={styles.notice}><p>{({ checking:'Checking contract and evidence…', wallet:'Confirm in your wallet.', pending:'Broadcast. Waiting for confirmed receipt…', confirming:'Receipt succeeded. Verifying allocation…', success:'Confirmed receipt and allocation readback succeeded. Refresh evidence before another action.', rejected:'Wallet request rejected.', reverted:'Transaction reverted. No allocation succeeded; gas may have been charged.', uncertain:'Outcome uncertain. Do not resend.', blocked:'Preflight blocked. Refresh evidence and authority.', ready:'', disposed:'' })[phase]}</p>{attempt.current?.snapshot.hash && <code>{attempt.current.snapshot.hash}</code>}{phase === 'uncertain' && attempt.current?.snapshot.hash && <TaskButton className={styles.secondary} onClick={() => void attempt.current?.checkReceipt()}>Check receipt without resending</TaskButton>}</div>}
    {confirmation && authority && <WorkspaceConfirmation title={confirmation === 'resolveDispute' ? 'Confirm allocation split' : 'Confirm backup handover'} description="This sends a real contract transaction. Only the nominated authority and current contract window can authorize resolution." acknowledgement="I reviewed this exact case, contract, recipients and allocation." confirmLabel="Continue to wallet" onDismiss={() => setConfirmation(null)} onConfirm={ok => { if (ok) void act(confirmation); }}><p>Chain {deployment.chain_id} · <code>{deployment.escrow_address}</code></p><p>Task {String(authority.taskId)} · allocation {authority.index} · {evidence.deliverable.title}</p><p>Manifest <code>{evidence.manifest_hash}</code></p>{confirmation === 'resolveDispute' ? <><p>Worker <code>{authority.worker}</code>: {split?.worker.toString()} base units.</p><p>Buyer <code>{authority.buyer}</code>: {split?.buyer.toString()} base units.</p><p>No arbiter fee. This credits pull-withdrawal balances, not an immediate wallet transfer.</p></> : <p>No allocation changes. Primary authority is revoked and a new 48-hour backup window starts when this transaction is mined.</p>}<p>Deposit: 0. Network gas is additional.</p></WorkspaceConfirmation>}
  </section>;
}
