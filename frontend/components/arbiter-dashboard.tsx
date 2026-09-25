'use client';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from './workspace-provider';
import { WalletControl } from './wallet-control';
import { workspaceRequest } from '../lib/workspace-client';
import type { ArbiterCase, ArbiterEvidence, ArbiterQueue } from '../lib/onchain-types';
import { TaskButton, TaskLoading, TaskTime, taskErrorMessage, useTaskResource } from './tasks/task-shared';
import styles from './tasks/task-styles';
import { SettlementSetup } from './onchain/setup';
import { ArbiterActions } from './onchain/arbiter-actions';

export default function ArbiterDashboard() {
  const { config, status, address, sessionKey } = useWorkspace();
  return <section className={styles.workspace}><div className={styles.stack}>
    <div className={styles.notice}><h2>Case-scoped access</h2><p>Your signed-in wallet must be the primary or backup arbiter nominated on a disputed agreement. Opening this page does not grant a role. Evidence access is not proof of an onchain dispute.</p><p>Only the contract determines who may resolve an allocation and when. AI and checker findings are advisory, never a payout instruction.</p></div>
    {status === 'loading' ? <TaskLoading label="Checking your session…" /> : config.enabled && status === 'signedIn' && address ? <PrivateQueue key={`${sessionKey}:${address}:${config.chain?.id}`} /> : <div className={styles.setupPanel}><h2>{config.enabled ? 'Sign in to read nominated cases' : 'Workspace setup is pending'}</h2><p>{config.enabled ? 'No private evidence is requested before wallet sign-in.' : config.reason || 'Wallet sign-in has not been configured.'}</p><WalletControl /><TaskButton className={styles.secondary} disabled>Resolve allocation · sign-in required</TaskButton></div>}
  </div></section>;
}
function PrivateQueue() {
  const [page, setPage] = useState<ArbiterQueue | null>(null);
  const [selected, setSelected] = useState<ArbiterCase | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const cursors = useRef(new Set<string>());
  async function load(cursor?: string) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setSelected(null); setLoading(true); setError(null); setPage(null);
    try {
      const result = await workspaceRequest<ArbiterQueue>('/arbiter/disputes?limit=50' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!cursor) cursors.current.clear(); else cursors.current.add(cursor);
      if (result.next_cursor && cursors.current.has(result.next_cursor)) throw Error('Repeated cursor.');
      setPage(result);
    } catch (cause) { if (!controller.signal.aborted) setError(cause); }
    finally { if (!controller.signal.aborted) { active.current = null; setLoading(false); } }
  }
  useEffect(() => { void load(); return () => { active.current?.abort(); active.current = null; }; }, []);
  return <>
    <SettlementSetup />
    <div className={styles.toolbar}><h2>Nominated disputes</h2><TaskButton className={styles.secondary} disabled={loading} onClick={() => void load()}>Refresh queue</TaskButton></div>
    {loading && <TaskLoading label="Reading private dispute queue…" />}
    {error != null && <p className={styles.errorBox} role="alert">{taskErrorMessage(error)} No case access or chain status is inferred.</p>}
    {page && !page.disputes.length && <div className={styles.empty}><h3>No nominated disputes returned</h3><p>This wallet has no cases on this page. No workload or settlement metrics are estimated.</p></div>}
    {page && <ul className={styles.taskList}>{page.disputes.map(c => <li key={c.task_id + ':' + c.deliverable_id} className={styles.taskRow}><div className={styles.taskSummary}><h3>{c.deliverable_id}</h3><code className={styles.fullValue}>{c.task_id}</code><p className={styles.hint}>Evidence version {c.version} · <TaskTime value={c.created_at} /></p></div><TaskButton className={styles.secondary} onClick={() => setSelected(c)}>Read scoped evidence</TaskButton></li>)}</ul>}
    {page?.next_cursor && <TaskButton className={styles.secondary} disabled={loading} onClick={() => void load(page.next_cursor!)}>Next page</TaskButton>}
    {selected && <CaseEvidence key={selected.task_id + selected.deliverable_id} selected={selected} />}
  </>;
}
function CaseEvidence({ selected }: { selected: ArbiterCase }) {
  const { data, error, loading } = useTaskResource<ArbiterEvidence>(`/arbiter/tasks/${selected.task_id}/deliverables/${selected.deliverable_id}/evidence`);
  if (loading) return <TaskLoading label="Reading this disputed deliverable only…" />;
  if (error || !data || data.manifest_hash !== selected.manifest_hash || data.delivery.latest_artifact_hash !== selected.artifact_hash) return <p role="alert" className={styles.errorBox}>Evidence unavailable or changed. Refresh the queue before continuing.</p>;
  return <section className={styles.section} aria-label="Dispute evidence"><h2>{data.deliverable.title}</h2><p className={styles.criteria}>{data.deliverable.criteria}</p><p>Agreed allocation: <code>{data.deliverable.amount_base_units}</code> native base units. This is not a verified locked balance.</p><p className={styles.hint}>Manifest fingerprint: <code>{data.manifest_hash}</code></p>
    <details className={styles.disclosure}><summary>Source and versioned evidence</summary><pre className={styles.source} tabIndex={0}>{JSON.stringify({ source: data.source, delivery: data.delivery }, null, 2)}</pre></details>
    <ArbiterActions evidence={data} />
  </section>;
}
