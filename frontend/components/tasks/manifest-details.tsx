'use client';

import type { Deliverable, Manifest } from '../../lib/workspace-types';
import type { TaskCreateInput } from '../../lib/task-form';
import { describeCheck, parseCriteria, summarizeCriteria } from '../../lib/criteria';
import { CopyValue, TaskTime } from './task-shared';
import styles from './task-styles';

// Criteria render as text, never HTML: pretty JSON plus a one-line summary when
// the criteria froze as structured JSON, otherwise the legacy prose verbatim.
export function CriteriaView({ criteria, manifestHash }: { criteria: string; manifestHash?: string }) {
  let structured = null;
  try {
    const parsed = parseCriteria(criteria);
    if (parsed.kind === 'json') structured = parsed.criteria;
  } catch { structured = null; }
  if (!structured) return <p className={styles.criteria}>{criteria}</p>;
  const frozen = structured;
  return <>
    <p className={styles.hint}>{summarizeCriteria(frozen)} Human review is still required; a passing check is not an acceptance.</p>
    {manifestHash && <p className={styles.hint}>Manifest SHA-256: <code className={styles.fullValue}>{manifestHash}</code></p>}
    <ul className="grid gap-2 pl-5">{frozen.checks.map(check => <li key={check.id}><code>{check.id}</code> · {describeCheck(check)}</li>)}</ul>
    <details className={styles.disclosure}><summary>View criteria JSON</summary><pre className={styles.source} tabIndex={0} aria-label="Frozen criteria JSON"><code>{JSON.stringify(frozen, null, 2)}</code></pre></details>
  </>;
}

export function DeliverableDetails({ deliverables, manifestHash }: { deliverables: Deliverable[]; manifestHash?: string }) {
  return <div className={styles.deliverables}>{deliverables.map((item, index) => <section className={styles.deliverable} key={item.id}>
    <div className={styles.sectionHeading}><h3>{index + 1}. {item.title}</h3><code>{item.id}</code></div>
    <CriteriaView criteria={item.criteria} manifestHash={manifestHash} />
    <dl className={styles.policyGrid}><div><dt>Allocation · base units</dt><dd className={styles.mono}>{item.amount_base_units}</dd></div><div><dt>Revision limit</dt><dd>{item.revision_limit}</dd></div><div><dt>Review period</dt><dd>{item.review_period_hours} hours</dd></div></dl>
  </section>)}</div>;
}

export function ManifestDetails({ terms, buyer, chainId, total, manifest, manifestHash }: { terms: TaskCreateInput; buyer: string; chainId: number; total: string; manifest?: Manifest; manifestHash?: string }) {
  return <div className={styles.stack}>
    <section className={styles.section} aria-labelledby="terms-heading"><h2 id="terms-heading">Agreement terms</h2><h3 className={styles.taskTitle}>{terms.title}</h3>
      <dl className={styles.policyGrid}><div><dt>Delivery deadline</dt><dd><TaskTime value={terms.delivery_deadline} /></dd></div><div><dt>Chain ID</dt><dd>{chainId}</dd></div><div><dt>Total · base units</dt><dd className={styles.mono}>{total}</dd></div></dl>
      <p className={styles.hint}>Amounts are exact base-unit allocations. No token denomination or decimal scale is assumed. This terms record does not track funds; inspect the onchain panel for verified balances and settlement.</p>
    </section>
    <section className={styles.section} aria-labelledby="participants-heading"><h2 id="participants-heading">Participants</h2><dl className={styles.participants}>
      <div><dt>Buyer</dt><dd><CopyValue value={buyer} label="buyer address" /></dd></div>
      <div><dt>Worker</dt><dd><CopyValue value={terms.worker} label="worker address" /></dd></div>
      <div><dt>Primary arbiter</dt><dd><CopyValue value={terms.primary_arbiter} label="primary arbiter address" /></dd></div>
      <div><dt>Backup arbiter</dt><dd><CopyValue value={terms.backup_arbiter} label="backup arbiter address" /></dd></div>
    </dl><p className={styles.hint}>Arbiters have no access to this unfunded task before a dispute.</p></section>
    <section className={styles.section} aria-labelledby="source-heading"><h2 id="source-heading">Source snapshot</h2><p className={styles.hint}>The full source is part of the immutable agreement. Empty strings and letter case are preserved.</p><pre className={styles.source} tabIndex={0} aria-label="Full source JSON"><code>{JSON.stringify(terms.source, null, 2)}</code></pre></section>
    <section className={styles.section} aria-labelledby="deliverables-heading"><h2 id="deliverables-heading">Deliverables · {terms.deliverables.length}</h2><DeliverableDetails deliverables={terms.deliverables} manifestHash={manifestHash} /></section>
    <section className={styles.section} aria-labelledby="policy-heading"><h2 id="policy-heading">Agreement policy</h2><dl className={styles.policyGrid}>
      <div><dt>Manifest version</dt><dd>{manifest?.version ?? 1}</dd></div><div><dt>Primary arbiter window</dt><dd>{manifest?.primary_arbiter_hours ?? 48} hours</dd></div><div><dt>Backup arbiter window</dt><dd>{manifest?.backup_arbiter_hours ?? 48} hours</dd></div>
      <div><dt>Manifest SHA-256</dt><dd>{manifestHash ? <code className={styles.fullValue}>{manifestHash}</code> : 'Assigned by the server after creation.'}</dd></div>
      <div><dt>Invitation expiry</dt><dd>{manifest ? <TaskTime value={manifest.invite_expires_at} /> : '72 hours after creation, or the delivery deadline if sooner. The server sets the exact time.'}</dd></div>
    </dl><p className={styles.hint}>Terms cannot be edited after creation. Workspace acceptance is separate from funding. Use the evidence review and onchain panels for their respective actions and status.</p></section>
  </div>;
}
