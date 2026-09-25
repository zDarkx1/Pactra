'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useConfig, usePublicClient, useSendTransaction } from 'wagmi';
import { getAccount } from 'wagmi/actions';
import { formatUnits, type Address, type Hex } from 'viem';
import { useWorkspace } from '../workspace-provider';
import { TaskButton, WorkspaceConfirmation, useTaskResource } from '../tasks/task-shared';
import styles from '../tasks/task-styles';
import { workspaceRequest } from '../../lib/workspace-client';
import type { Task } from '../../lib/workspace-types';
import type { ChainBinding, OnchainConfig } from '../../lib/onchain-types';
import type { DeliveryHistory } from '../../lib/delivery-types';
import { escrowAbi } from '../../lib/onchain-contract';
import { createTransactionAttempt } from '../../lib/onchain-transaction';
import { freezeReviewEvidence, isReviewAction, assertTaskReadback, assertReceiptTransaction, prepareTaskCall, readVerifiedTask, verifyDeployment, type ChainIntent, type TransactionCall, type VerifiedTask } from '../../lib/onchain-service';
import { AgreementDisplay, BilateralAgreement } from './bilateral-agreement';

const labels = { createTask: 'Create onchain agreement', acceptTask: 'Accept onchain terms', fundTask: 'Fund exact allocation total', submitDeliverable: 'Submit persisted artifact onchain', acceptDeliverable: 'Accept and allocate payment', requestRevision: 'Request revision onchain', openDispute: 'Open onchain dispute', claimTimeout: 'Claim review timeout', refundUnsubmitted: 'Refund never-submitted allocation', handoverDispute: 'Record backup handover', resolveDispute: 'Resolve allocation', withdraw: 'Withdraw available balance', settleByAgreement: 'Relay bilateral settlement' };
const phases = { ready: '', checking: 'Verifying deployment, immutable terms and contract simulation…', wallet: 'Confirm in your wallet. No receipt yet.', pending: 'Transaction broadcast. Waiting for a confirmed receipt…', confirming: 'Receipt succeeded. Reading authoritative state…', success: 'Confirmed receipt and authoritative readback succeeded.', rejected: 'Wallet request rejected. No transaction hash was returned.', reverted: 'Transaction reverted. No settlement succeeded; network gas may have been charged.', uncertain: 'Outcome uncertain. Do not send again. Check the receipt or reconcile the creation hash.', blocked: 'Preflight blocked this action. Refresh deployment and chain state before trying again.', disposed: '' };
export function TaskOnchain({ task }: { task: Task }) {
  const deployment = useTaskResource<OnchainConfig>('/onchain/config');
  if (task.status !== 'accepted_unfunded') return null;
  return <section className={styles.section} aria-label="Onchain task actions"><h2>Onchain task actions</h2>
    <p className={styles.hint}>Workspace acceptance and voluntary evidence review are separate from chain state. Only confirmed contract reads below describe funding or settlement.</p>
    {deployment.loading ? <p role="status">Checking settlement setup…</p> : deployment.error || !deployment.data?.enabled ? <div className={styles.setupPanel}><p>{deployment.error ? 'Deployment configuration could not be verified.' : 'No escrow contract is configured.'} Transactions are disabled. Voluntary unfunded review remains available below.</p><TaskButton className={styles.primary} disabled>Funding · setup required</TaskButton><TaskButton className={styles.secondary} onClick={() => void deployment.reload()}>Check setup again</TaskButton></div> : <ConnectedActions task={task} deployment={deployment.data} />}
  </section>;
}
function ConnectedActions({ task, deployment }: { task: Task; deployment: OnchainConfig }) {
  const workspace = useWorkspace();
  const wagmi = useConfig();
  const client = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const [state, setState] = useState<VerifiedTask>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [read, setRead] = useState(false);
  const [error, setError] = useState('');
  const [intent, setIntent] = useState<ChainIntent | null>(null);
  const [recoveryHash, setRecoveryHash] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [, render] = useState(0);
  const attempt = useRef<ReturnType<typeof createTransactionAttempt> | null>(null);
  const alive = useRef(true);
  const readGeneration = useRef(0);
  const identity = `${workspace.sessionKey}:${workspace.address}:${workspace.config.chain?.id}`;
  const currentIdentity = useRef(identity); currentIdentity.current = identity;
  const initialIdentity = useRef(identity);
  const pending = attempt.current?.snapshot;
  const busy = !!pending && !['ready', 'rejected', 'reverted', 'blocked', 'success'].includes(pending.phase);
  const actor = workspace.address as Address;
  const symbol = workspace.config.chain!.nativeCurrency.symbol;
  const amount = (value: bigint) => `${formatUnits(value, workspace.config.chain!.nativeCurrency.decimals)} ${symbol} (${value} base units)`;
  function assertIdentity() {
    const account = getAccount(wagmi);
    if (!alive.current || currentIdentity.current !== initialIdentity.current || workspace.status !== 'signedIn' || account.address?.toLowerCase() !== actor?.toLowerCase() || account.chainId !== workspace.config.chain?.id) throw Error('Wallet identity changed.');
    return account;
  }
  async function refresh() {
    if (!client) return;
    const generation = ++readGeneration.current;
    setRead(false); setError(''); setState(null); setBalance(null);
    try {
      const account = assertIdentity();
      await verifyDeployment(client, deployment, workspace.config.chain!.id, account.chainId);
      const next = await readVerifiedTask(client, deployment, task);
      const credit = await client.readContract({ address: deployment.escrow_address as Address, abi: escrowAbi, functionName: 'balances', args: [actor] });
      assertIdentity();
      if (generation === readGeneration.current) { setState(next); setBalance(credit); setRead(true); }
    } catch { if (alive.current && generation === readGeneration.current) setError('Could not verify deployment and immutable chain state. Actions are disabled.'); }
  }
  useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false; readGeneration.current++; }; }, []);
  useLayoutEffect(() => () => { alive.current = false; attempt.current?.dispose(); }, []);
  async function act(reviewed: ChainIntent) {
    if (!client || !read || busy || (attempt.current && !['ready','rejected','reverted','blocked','success'].includes(attempt.current.snapshot.phase))) return;
    assertIdentity(); setIntent(null);
    attempt.current?.dispose();
    const transaction = createTransactionAttempt(() => { if (alive.current) render(n => n + 1); });
    attempt.current = transaction;
    let call: TransactionCall;
    let confirmedHash: Hex;
    await transaction.send({
      validate: async () => {
        const account = assertIdentity();
        await verifyDeployment(client, deployment, workspace.config.chain!.id, account.chainId);
        try { call = await prepareTaskCall(client, deployment, task, actor, reviewed); }
        catch (cause) {
          if (alive.current && isReviewAction(reviewed.action)) setError('Review consent could not be revalidated. Evidence may have changed. Read chain state and review the current round, artifact hash and submission timestamp before opening a new confirmation. No transaction was sent.');
          throw cause;
        }
        assertIdentity();
      },
      send: async () => { assertIdentity(); return sendTransactionAsync(call); },
      receipt: async hash => {
        const receipt = await client.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 120000 });
        const tx = await client.getTransaction({ hash: receipt.transactionHash });
        assertReceiptTransaction(call, tx);
        confirmedHash = receipt.transactionHash;
        return receipt;
      },
      readback: async () => {
        assertIdentity();
        if (reviewed.action === 'createTask') {
          await workspaceRequest<ChainBinding>(`/tasks/${task.id}/onchain/reconcile`, { method: 'POST', body: JSON.stringify({ transaction_hash: confirmedHash }) });
        }
        const next = await readVerifiedTask(client, deployment, task);
        assertIdentity();
        if (!next) throw Error('Binding not confirmed.');
        assertTaskReadback(next, reviewed);
        if (reviewed.action === 'settleByAgreement') {
          const nonce = await client.readContract({ address: deployment.escrow_address as Address, abi: escrowAbi, functionName: 'settlementNonces', args: [BigInt(next.binding.onchain_task_id), BigInt(reviewed.index!)], blockNumber: next.blockNumber });
          if (nonce !== BigInt(reviewed.agreement!.message.nonce) + BigInt(1)) throw Error('Settlement nonce consumption not observed.');
        }
        const credit = await client.readContract({ address: deployment.escrow_address as Address, abi: escrowAbi, functionName: 'balances', args: [actor] });
        assertIdentity(); setBalance(credit);
        setState(next); setRead(true);
      },
    });
  }
  async function recover() {
    if (!/^0x[0-9a-fA-F]{64}$/.test(recoveryHash) || recovering || busy) return;
    setRecovering(true); setRead(false); setError('');
    try {
      assertIdentity();
      await workspaceRequest<ChainBinding>(`/tasks/${task.id}/onchain/reconcile`, { method: 'POST', body: JSON.stringify({ transaction_hash: recoveryHash }) });
      assertIdentity(); await refresh();
    } catch { if (alive.current) setError('Creation receipt could not be verified. No transaction was sent or retried.'); }
    finally { if (alive.current) setRecovering(false); }
  }
  function button(action: ChainIntent['action'], available: boolean, index?: number) {
    return <TaskButton key={action} className={styles.secondary} disabled={!read || busy || recovering || preparing || !available} onClick={() => void reviewIntent({ action, index })}>{labels[action]}</TaskButton>;
  }
  async function reviewIntent(next: ChainIntent) {
    if (preparing || busy) return;
    if (next.action === 'withdraw') { if (balance !== null && balance > BigInt(0)) setIntent({ ...next, expectedBalance: balance }); return; }
    if (isReviewAction(next.action)) {
      const allocation = next.index === undefined ? undefined : state?.allocations[next.index];
      if (!allocation) return;
      try { setError(''); setIntent(Object.freeze({ ...next, reviewEvidence: freezeReviewEvidence(allocation) })); }
      catch { setError('Confirmed review evidence is unavailable. Read chain state before trying again.'); }
      return;
    }
    if (next.action !== 'submitDeliverable') { setIntent(next); return; }
    setPreparing(true); setError('');
    try {
      const history = await workspaceRequest<DeliveryHistory>(`/tasks/${task.id}/deliverables/${task.manifest.deliverables[next.index!].id}/submissions`);
      assertIdentity();
      if (!history.latest_artifact_hash || !history.latest_version) throw Error('No persisted artifact.');
      setIntent({ ...next, artifactHash: history.latest_artifact_hash, artifactVersion: history.latest_version });
    } catch { if (alive.current) setError('Persist and review an artifact in the evidence panel first. No onchain submission was sent.'); }
    finally { if (alive.current) setPreparing(false); }
  }
  const buyer = actor?.toLowerCase() === task.manifest.buyer.toLowerCase();
  const worker = actor?.toLowerCase() === task.manifest.worker.toLowerCase();
  return <div className={styles.stack}>
    <p>Chain {deployment.chain_id} · <code>{deployment.escrow_address}</code></p>
    <p className={styles.notice}>Transactions use native currency and require wallet confirmation plus network gas. Funds may remain locked if arbiters miss their windows; bilateral signed settlement is required after the backup window. The backend attests artifact availability, not quality.</p>
    <TaskButton className={styles.secondary} disabled={busy || recovering || preparing || !!intent} onClick={() => void refresh()}>Read chain state</TaskButton>
    {error && <p role="alert" className={styles.errorBox}>{error}</p>}
    {pending && <div role="status" aria-live="polite" className={styles.notice}><p>{phases[pending.phase]}</p>{pending.hash && <code>{pending.hash}</code>}{pending.phase === 'uncertain' && pending.hash && <TaskButton className={styles.secondary} onClick={() => void attempt.current?.checkReceipt()}>Check receipt without resending</TaskButton>}</div>}
    {read && !state && <><p>No verified chain binding exists for this accepted agreement. Creation does not fund it; worker acceptance and buyer funding are separate transactions.</p>{button('createTask', buyer)}<label className={styles.field}>Already created? Paste the exact creation transaction hash<input value={recoveryHash} onChange={e => setRecoveryHash(e.target.value)} autoComplete="off" spellCheck={false} /></label><TaskButton className={styles.secondary} disabled={busy || recovering || !/^0x[0-9a-fA-F]{64}$/.test(recoveryHash)} onClick={() => void recover()}>Verify existing creation receipt</TaskButton></>}
    {read && state && <>
      <p>Chain task {state.binding.onchain_task_id} · block {String(state.blockNumber)} · {['Awaiting worker', 'Accepted, unfunded', 'Funded', 'Completed'][state.state[6]] ?? 'Unknown state — do not act'}</p>
      <p>Total agreed: {amount(BigInt(task.manifest.total_base_units))}</p>
      <div className={styles.actions}>{button('acceptTask', worker && state.state[6] === 0)}{button('fundTask', buyer && state.state[6] === 1)}</div>
      {state.allocations.map((allocation, index) => <section className={styles.deliverable} key={index}><h3>{task.manifest.deliverables[index].title}</h3><p>Allocation: {amount(allocation.amount)} · {['Awaiting submission', 'In review', 'Disputed', 'Settled'][allocation.status]}</p>
        {allocation.status === 1 && <p>Review round {String(BigInt(allocation.revisionsUsed) + BigInt(1))} · artifact hash <code>{allocation.artifactHash}</code> · submittedAt {String(allocation.submittedAt)} (Unix seconds). Compare this hash with the artifact you reviewed.</p>}
        {allocation.status === 3 && <p>Worker award: {amount(allocation.workerAward)}. Buyer refund: {amount(allocation.buyerRefund)}. Allocated balances require pull withdrawal; this is not a transfer receipt.</p>}
        <div className={styles.actions}>
          {button('submitDeliverable', worker && deployment.attestation_available && state.state[6] === 2 && allocation.status === 0, index)}
          {button('acceptDeliverable', buyer && allocation.status === 1, index)}
          {button('requestRevision', buyer && allocation.status === 1, index)}
          {button('openDispute', allocation.status === 1 && (buyer || worker), index)}
          {button('claimTimeout', worker && allocation.status === 1 && state.timestamp > allocation.submittedAt + BigInt(task.manifest.deliverables[index].review_period_hours * 3600), index)}
          {button('refundUnsubmitted', buyer && state.state[6] === 2 && allocation.status === 0 && !allocation.everSubmitted && state.timestamp > allocation.deadline, index)}
          {button('handoverDispute', allocation.status === 2 && allocation.handoverAt === BigInt(0) && state.timestamp > allocation.disputeOpenedAt + BigInt(172800), index)}
        </div>
        {allocation.status === 2 && <p>Backup handover: {allocation.handoverAt === BigInt(0) ? 'not recorded; bilateral settlement unavailable' : `${allocation.handoverAt} Unix seconds. Bilateral settlement requires chain time strictly greater than ${allocation.handoverAt + BigInt(172800)} Unix seconds (handover + 48 hours).`} Read chain state after the window; nothing runs automatically.</p>}
        {allocation.status === 2 && allocation.handoverAt > BigInt(0) && state.timestamp > allocation.handoverAt + BigInt(172800) && <BilateralAgreement task={task} deployment={deployment} index={index} disabled={busy || recovering || preparing || !!intent} onBusy={setPreparing} onRelay={next => { if (!busy && !preparing && !intent) setIntent(next); }} />}
        {!deployment.attestation_available && worker && <p className={styles.hint}>Onchain submission is disabled: availability attestation is not configured.</p>}
      </section>)}
      <p>Wallet credit across this escrow: {balance === null ? 'not verified' : amount(balance)}. Withdrawal sends the full credit to your wallet.</p>
      {button('withdraw', (buyer || worker) && balance !== null && balance > BigInt(0))}
    </>}
    {intent && <WorkspaceConfirmation title={labels[intent.action] + '?'} description="This is a real contract transaction, not a workspace review. Inspect the chain, contract, exact amounts and immutable terms before confirming in your wallet." acknowledgement="I reviewed the exact contract action and amounts, including gas and lockup risk." confirmLabel="Continue to wallet" onDismiss={() => setIntent(null)} onConfirm={acknowledged => { if (acknowledged) void act(intent); }}>
      <p>Chain {deployment.chain_id} · <code>{deployment.escrow_address}</code></p><p>Manifest content hash: <code>{task.manifest_hash}</code></p><p>Buyer: <code>{task.manifest.buyer}</code><br />Worker: <code>{task.manifest.worker}</code></p>
      <p>Transaction deposit: {amount(intent.action === 'fundTask' ? BigInt(task.manifest.total_base_units) : BigInt(0))}, plus gas.</p>
      {intent.index !== undefined && <p>Deliverable #{intent.index}: {task.manifest.deliverables[intent.index].title}. Allocation: {amount(BigInt(task.manifest.deliverables[intent.index].amount_base_units))}.</p>}
      {intent.artifactHash && <p>Persisted artifact version {intent.artifactVersion}: <code>{intent.artifactHash}</code>. This exact hash is frozen for this confirmation.</p>}
      {intent.reviewEvidence && <div aria-label="Frozen review evidence"><p>Review round: {String(intent.reviewEvidence.round)}</p><p>Artifact hash: <code>{intent.reviewEvidence.artifactHash}</code></p><p>submittedAt: {String(intent.reviewEvidence.submittedAt)} (Unix seconds)</p><p>These exact values are frozen for this confirmation and checked again before the wallet prompt and atomically by the contract when mined. If evidence changes, this action cannot apply to the new submission: refresh, inspect the new artifact and give new consent.</p></div>}
      {intent.agreement && intent.index !== undefined && <><AgreementDisplay agreement={intent.agreement} task={task} index={intent.index} /><p>Both buyer and worker signatures are included. They and the current nonce/state will be revalidated, then the contract call simulated before wallet relay. The relayer gains no authority from a backend role.</p></>}
      {intent.expectedBalance !== undefined && <p>Withdraw full escrow credit: {amount(intent.expectedBalance)} to <code>{actor}</code>.</p>}
      {intent.index !== undefined && ['acceptDeliverable', 'claimTimeout', 'refundUnsubmitted'].includes(intent.action) && <p>Worker allocation: {amount(intent.action === 'refundUnsubmitted' ? BigInt(0) : BigInt(task.manifest.deliverables[intent.index].amount_base_units))}. Buyer refund: {amount(intent.action === 'refundUnsubmitted' ? BigInt(task.manifest.deliverables[intent.index].amount_base_units) : BigInt(0))}. Credits require a separate withdrawal.</p>}
      <p>{intent.action === 'handoverDispute' ? 'This records the handover, revokes primary authority and starts the backup’s 48-hour window. It does not settle or withdraw funds.' : intent.action === 'submitDeliverable' ? 'The exact current persisted artifact will be checked for availability. A valid submission starts the onchain review clock; it does not assert quality.' : 'The contract rechecks current role, terms, status and deadlines. A simulation cannot guarantee the later transaction will succeed.'}</p>
    </WorkspaceConfirmation>}
  </div>;
}
