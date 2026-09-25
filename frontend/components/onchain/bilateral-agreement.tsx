'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { useConfig, usePublicClient, useSignTypedData } from 'wagmi';
import { getAccount } from 'wagmi/actions';
import { formatUnits, hashTypedData, type Address } from 'viem';
import { useWorkspace } from '../workspace-provider';
import { CopyValue, TaskButton, WorkspaceConfirmation } from '../tasks/task-shared';
import styles from '../tasks/task-styles';
import { onWorkspaceIdentityChange } from '../../lib/workspace-client';
import { verifyDeployment, type ChainIntent } from '../../lib/onchain-service';
import { agreementTypedData, createAgreement, expiryUTC, parseAgreement, serializeAgreement, settlementTypes, validateAgreement, type Agreement } from '../../lib/onchain-agreement';
import type { OnchainConfig } from '../../lib/onchain-types';
import type { Task } from '../../lib/workspace-types';

export function AgreementDisplay({ agreement: p, task, index }: { agreement: Agreement; task: Task; index: number }) {
  const { config } = useWorkspace();
  const currency = config.chain!.nativeCurrency;
  const amount = (value: bigint) => `${formatUnits(value, currency.decimals)} ${currency.symbol} (${value} native base units)`;
  const refund = BigInt(task.manifest.deliverables[index].amount_base_units) - BigInt(p.message.workerAmount);
  return <div className={styles.stack}>
    <p>EIP-712 domain: {p.domain.name} · version {p.domain.version} · chain {p.domain.chainId} · verifying contract <code>{p.domain.verifyingContract}</code></p>
    <p>Chain task ID: {p.message.taskId} · allocation index: {p.message.index} (zero-based)</p>
    <p>Signed manifestHash (contract manifest digest): <code>{p.message.manifestHash}</code></p>
    <p>Manifest content hash (not the signed manifestHash): <code>{task.manifest_hash}</code></p>
    <p>Worker award: {amount(BigInt(p.message.workerAmount))} to <code>{task.manifest.worker}</code>.</p>
    <p>Buyer refund: {amount(refund)} to <code>{task.manifest.buyer}</code>. Derived as immutable allocation minus workerAmount; not a separate EIP-712 field.</p>
    <p>Nonce: {p.message.nonce}</p>
    <p>Expiry: {p.message.expiry} Unix seconds · {expiryUTC(p.message.expiry)} (UTC). Valid through the exact expiry second onchain; invalid after it. Not milliseconds.</p>
    <p>Digest: <code>{hashTypedData(agreementTypedData(p))}</code></p>
    <p>Exact primary type: Settlement. Numeric fields below are decimal strings for lossless display/exchange.</p>
    <pre aria-label="Exact EIP-712 typed data" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ domain: p.domain, primaryType: 'Settlement', types: settlementTypes, message: p.message }, null, 2)}</pre>
    <p>Settlement credits pull balances, not immediate wallet transfers. No deposit; relay pays gas. No automatic payment or unilateral fallback.</p>
  </div>;
}

export function BilateralAgreement({ task, deployment, index, disabled, onBusy, onRelay }: {
  task: Task; deployment: OnchainConfig; index: number; disabled: boolean;
  onBusy: (busy: boolean) => void; onRelay: (intent: ChainIntent) => void;
}) {
  const workspace = useWorkspace(), wagmi = useConfig(), client = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  const [workerAmount, setWorkerAmount] = useState('');
  const [expiry, setExpiry] = useState('');
  const [raw, setRaw] = useState('');
  const [proposal, setProposal] = useState<Agreement | null>(null);
  const [consent, setConsent] = useState<Agreement | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false), alive = useRef(true);
  const identity = `${workspace.sessionKey}:${workspace.address}:${workspace.config.chain?.id}`;
  const initial = useRef(identity), latest = useRef(identity); latest.current = identity;
  useLayoutEffect(() => {
    alive.current = true;
    const stop = onWorkspaceIdentityChange(() => { alive.current = false; setProposal(null); setConsent(null); setRaw(''); });
    return () => { alive.current = false; stop(); };
  }, []);
  const actor = workspace.address as Address;
  const role = actor?.toLowerCase() === task.manifest.buyer.toLowerCase() ? 'buyerSignature' : actor?.toLowerCase() === task.manifest.worker.toLowerCase() ? 'workerSignature' : null;
  function assertIdentity() {
    const a = getAccount(wagmi);
    if (!alive.current || latest.current !== initial.current || workspace.status !== 'signedIn' || a.address?.toLowerCase() !== actor?.toLowerCase() || a.chainId !== workspace.config.chain?.id) throw Error('Wallet or session changed. Reopen the task.');
    return a;
  }
  async function checked() {
    if (!client) throw Error('No chain client.');
    const a = assertIdentity();
    await verifyDeployment(client, deployment, workspace.config.chain!.id, a.chainId);
    assertIdentity();
    return client;
  }
  async function run(operation: () => Promise<void>) {
    if (disabled || locked.current) return;
    locked.current = true; setBusy(true); onBusy(true); setError('');
    try { await operation(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Agreement verification failed. No automatic retry.'); }
    finally { locked.current = false; if (alive.current) { setBusy(false); onBusy(false); } }
  }
  async function prepare(imported: boolean) {
    // Remove stale usable signatures before checking new untrusted input.
    setProposal(null); setConsent(null);
    await run(async () => {
      const c = await checked();
      const p = imported ? await validateAgreement(c, deployment, task, index, parseAgreement(raw)) : await createAgreement(c, deployment, task, index, workerAmount, expiry);
      assertIdentity(); setProposal(p); setRaw('');
    });
  }
  async function sign(p: Agreement) {
    setConsent(null);
    await run(async () => {
      if (!role) throw Error('Only the named buyer or worker may sign.');
      const c = await checked();
      await validateAgreement(c, deployment, task, index, p);
      assertIdentity();
      const sig = await signTypedDataAsync({ ...agreementTypedData(p), account: actor });
      assertIdentity();
      // A returned wallet signature is untrusted until recovery / ERC-1271 and fresh state checks pass.
      const signed = await validateAgreement(c, deployment, task, index, { ...p, [role]: sig });
      assertIdentity(); setProposal(signed);
    });
  }
  const unavailable = disabled || busy;
  return <section className={styles.stack} aria-label="Bilateral settlement">
    <h4>Bilateral settlement after missed backup window</h4>
    <p>Both parties must voluntarily sign the same exact split. Signing is not a login: it authorizes anyone holding both signatures to settle until expiry. Closing this page does not revoke signatures. Without both signatures funds stay locked. Never paste a private key or seed phrase.</p>
    <fieldset disabled={unavailable || !!proposal}>
      <label className={styles.field}>Worker award in integer native base units<input inputMode="numeric" autoComplete="off" value={workerAmount} onChange={e => setWorkerAmount(e.target.value)} /></label>
      <label className={styles.field}>Expiry in Unix seconds (UTC, inclusive)<input inputMode="numeric" autoComplete="off" value={expiry} onChange={e => setExpiry(e.target.value)} /></label>
      <TaskButton className={styles.secondary} disabled={!workerAmount || !expiry} onClick={() => void prepare(false)}>Prepare exact agreement</TaskButton>
    </fieldset>
    <label className={styles.field}>Paste agreement JSON with public signatures only<textarea autoComplete="off" spellCheck={false} maxLength={40000} disabled={unavailable} value={raw} onChange={e => { setRaw(e.target.value); setProposal(null); setConsent(null); }} /></label>
    <TaskButton className={styles.secondary} disabled={unavailable || !raw} onClick={() => void prepare(true)}>Validate pasted agreement against chain</TaskButton>
    {busy && <p role="status">Checking chain state or awaiting wallet signature. No transaction is sent by signing.</p>}
    {error && <p role="alert" className={styles.errorBox}>{error}</p>}
    {proposal && <>
      <AgreementDisplay agreement={proposal} task={task} index={index} />
      <p>Buyer signature: {proposal.buyerSignature ? 'verified for this agreement at last check' : 'missing'}. Worker signature: {proposal.workerSignature ? 'verified for this agreement at last check' : 'missing'}.</p>
      <CopyValue value={serializeAgreement(proposal)} label="agreement JSON" />
      <TaskButton className={styles.secondary} disabled={unavailable || !role || !!proposal[role!]} onClick={() => setConsent(proposal)}>Review wallet signature</TaskButton>
      <TaskButton className={styles.primary} disabled={unavailable || !proposal.buyerSignature || !proposal.workerSignature} onClick={() => onRelay({ action: 'settleByAgreement', index, agreement: proposal })}>Review bilateral relay</TaskButton>
      <TaskButton className={styles.secondary} disabled={unavailable} onClick={() => { setProposal(null); setConsent(null); setRaw(''); }}>Discard local agreement</TaskButton>
      <p>Copy the exported JSON to the other party through your chosen channel. They validate, review and sign it, then return the combined JSON. No signature is uploaded to the backend. Discarding only clears this local view; already shared signatures remain usable until expiry or settlement.</p>
    </>}
    {consent && <WorkspaceConfirmation title="Sign bilateral settlement?" description="This wallet signature authorizes the displayed split, not a login. Anyone with both signatures may relay it. It cannot be revoked by closing or clearing this page." acknowledgement="I voluntarily approve this exact split, recipients, domain, nonce and expiry." confirmLabel="Sign exact agreement in wallet" onDismiss={() => setConsent(null)} onConfirm={ack => { if (ack) void sign(consent); }}>
      <p>Signing as {role === 'buyerSignature' ? 'buyer' : 'worker'}: <code>{actor}</code></p>
      <AgreementDisplay agreement={consent} task={task} index={index} />
    </WorkspaceConfirmation>}
  </section>;
}
