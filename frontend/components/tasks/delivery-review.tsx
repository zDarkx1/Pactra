'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Checkbox, Dialog } from 'radix-ui';
import { useWorkspace } from '../workspace-provider';
import { Icon } from '../ui';
import { workspaceRequest, WorkspaceError } from '../../lib/workspace-client';
import type { Deliverable, Task } from '../../lib/workspace-types';
import { buildDeliveryIntent, deliveryRevisionsRemaining, type DeliveryAction, type DeliveryHistory, type DeliveryIntent, type DeliverySubmission } from '../../lib/delivery-types';
import { SessionExpired, TaskTime, taskErrorStatus } from './task-shared';
import styles from './task-styles';

const stateLabels = { not_submitted: 'No submission', submitted: 'Awaiting buyer review', revision_requested: 'Revision requested', accepted: 'Accepted by buyer', disputed: 'Disputed · review frozen' };
const actionLabels: Record<DeliveryAction, string> = { submit: 'Submit voluntary work', accept: 'Accept this version', request_revision: 'Request revision', dispute: 'Flag dispute' };
const warning = 'No deposit has been made. There is no obligation to start work and no financial deadlines. This is voluntary unfunded work review only.';
const freezeWarning = 'A dispute permanently freezes review for this deliverable. It records a participant allegation, not a verified finding. There is no automated arbitration or resolution.';

export function DeliveryReview({ task }: { task: Task }) {
  const { address, status, sessionKey, config } = useWorkspace();
  const account = address?.toLowerCase();
  const role = account === task.manifest.buyer.toLowerCase() ? 'buyer' : account === task.manifest.worker.toLowerCase() ? 'worker' : null;
  if (status !== 'signedIn' || !account || !role || task.status !== 'accepted_unfunded') return null;
  // Key the entire private subtree, not just the fetching effect: old artifacts/drafts
  // cannot appear for even one render after a task/account/session change.
  const scope = [account, sessionKey, config.chain?.id, task.id, task.manifest_hash].join(':');
  return <section className={styles.stack} aria-label="Voluntary unfunded work review" key={scope}>
    <h2>Voluntary unfunded work review</h2>
    <p className={styles.notice}><Icon name="info" />{warning}</p>
    <p className={styles.hint}>You are the {role}. Only the buyer and worker can view these artifacts. Drafts stay in memory in this view and are cleared when you leave or change accounts.</p>
    {task.manifest.deliverables.map(deliverable => <DeliverableReview key={scope + ':' + deliverable.id} task={task} deliverable={deliverable} role={role} />)}
  </section>;
}
export default DeliveryReview;

function deliveryError(error: unknown): string {
  switch (taskErrorStatus(error)) {
    case 400: return 'The server rejected this input. Check the raw JSON, notes and acknowledgment. Duplicate JSON keys and invalid Unicode are rejected.';
    case 401: return 'Your session expired. Sign in again.';
    case 403: case 404: return 'This deliverable is unavailable to this account.';
    case 409: return 'The review state or version conflicts with this intent. Read the server history; do not create a replacement intent while the result is uncertain.';
    case 413: return 'This request is too large. Artifact JSON is limited to 16 KiB.';
    case 429: return 'Too many requests. Try again manually later.';
    default: return 'Could not confirm the server result. Check your connection and read the current review.';
  }
}
function matchSnapshot(snapshot: DeliveryHistory, task: Task, deliverable: Deliverable): DeliveryHistory {
  if (snapshot.task_id !== task.id || snapshot.deliverable_id !== deliverable.id || snapshot.manifest_hash !== task.manifest_hash || snapshot.revision_limit !== deliverable.revision_limit ||
    snapshot.submissions.some(s => s.actor.toLowerCase() !== task.manifest.worker.toLowerCase()) ||
    snapshot.reviews.some(r => r.actor.toLowerCase() !== task.manifest.buyer.toLowerCase()) ||
    snapshot.disputes.some(d => ![task.manifest.buyer.toLowerCase(), task.manifest.worker.toLowerCase()].includes(d.actor.toLowerCase()))) {
    throw new WorkspaceError('The response does not match this deliverable.', 502);
  }
  return snapshot;
}

function useDelivery(task: Task, deliverable: Deliverable) {
  const [history, setHistory] = useState<DeliveryHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [expired, setExpired] = useState(false);
  const [inaccessible, setInaccessible] = useState(false);
  const [intent, setIntent] = useState<DeliveryIntent | null>(null);
  const held = useRef<DeliveryIntent | null>(null);
  const active = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const path = '/tasks/' + task.id + '/deliverables/' + deliverable.id + '/submissions';
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; active.current?.abort(); active.current = null; held.current = null; };
  }, []);
  function current(controller: AbortController) { return alive.current && !controller.signal.aborted && active.current === controller; }
  function clearPrivate() { setHistory(null); held.current = null; setIntent(null); setFresh(false); }
  function handleError(cause: unknown) {
    const status = taskErrorStatus(cause);
    if (status === 401) { clearPrivate(); setExpired(true); }
    if (status === 403 || status === 404) { clearPrivate(); setInaccessible(true); }
    setError(deliveryError(cause));
  }
  async function read(controller: AbortController) {
    const result = matchSnapshot(await workspaceRequest<DeliveryHistory>(path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }), task, deliverable);
    if (!current(controller)) throw new DOMException('Discarded delivery read.', 'AbortError');
    setHistory(result); setFresh(true);
    return result;
  }
  async function reload() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setFresh(false); setError('');
    try { await read(controller); }
    catch (cause) { if (current(controller)) handleError(cause); }
    finally { if (current(controller)) { active.current = null; setBusy(false); } }
  }
  useEffect(() => { void reload(); }, []);
  async function send(next?: DeliveryIntent) {
    if (active.current || expired || inaccessible || (!next && !held.current)) return;
    if (next && (held.current || !fresh)) return;
    const retry = !next;
    const attempt = next ?? held.current!;
    held.current = attempt; setIntent(attempt);
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setFresh(false); setError(''); setFeedback('');
    let writeConfirmed = false;
    try {
      // A retry must read first. The original body/key are never changed to fit
      // newer state: a replay may legitimately return an older 201 snapshot.
      if (retry) await read(controller);
      await workspaceRequest<DeliveryHistory>(attempt.path, { method: 'POST', body: attempt.body,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }).then(value => matchSnapshot(value, task, deliverable));
      if (!current(controller)) return;
      writeConfirmed = true;
      held.current = null; setIntent(null);
      setFeedback('The server confirmed this intent. Reading the current history…');
      setFresh(false);
      await read(controller); // Never show the potentially historical replay as current.
      if (current(controller)) setFeedback('Intent confirmed; current server history loaded.');
      return true;
    } catch (cause) {
      if (!current(controller)) return;
      const status = taskErrorStatus(cause);
      const uncertain = retry || status === 0 || status >= 500 || status === 408 || status === 409;
      if (!uncertain || writeConfirmed) { held.current = null; setIntent(null); }
      handleError(cause);
      setFresh(false);
      if (status !== 401 && status !== 403 && status !== 404) {
        if (!writeConfirmed && uncertain) setFeedback('The result is uncertain. The exact intent and UUID are retained in memory; new edits are blocked. Reading current history does not prove whether this intent committed.');
        if (!retry || writeConfirmed) {
          try { await read(controller); }
          catch (readError) { if (current(controller)) handleError(readError); }
        }
      }
    } finally {
      if (current(controller)) { active.current = null; setBusy(false); }
    }
  }
  return { history, busy, fresh, error, feedback, expired, inaccessible, intent, reload, send };
}

function DeliverableReview({ task, deliverable, role }: { task: Task; deliverable: Deliverable; role: 'buyer' | 'worker' }) {
  const review = useDelivery(task, deliverable);
  const [raw, setRaw] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmation, setConfirmation] = useState<DeliveryAction | null>(null);
  const [inputError, setInputError] = useState('');
  const heading = useId();
  const feedback = useRef<HTMLDivElement>(null);
  const h = review.history;
  const locked = review.busy || !review.fresh || !!review.intent || confirmation !== null;
  useEffect(() => { if (review.feedback || review.error || inputError) feedback.current?.focus(); }, [review.feedback, review.error, inputError]);
  useEffect(() => { if (review.expired || review.inaccessible) { setRaw(''); setNotes(''); setConfirmation(null); setInputError(''); } }, [review.expired, review.inaccessible]);
  if (review.expired) return <SessionExpired />;
  if (review.inaccessible) return <p role="alert" className={styles.errorBox}>This deliverable is unavailable. Private review data has been cleared.</p>;
  const remaining = h ? deliveryRevisionsRemaining(h) : 0;
  const canSubmit = role === 'worker' && h && (h.state === 'not_submitted' || (h.state === 'revision_requested' && remaining > 0));
  const canReview = role === 'buyer' && h?.state === 'submitted';
  const canDispute = h && ['submitted', 'revision_requested'].includes(h.state);
  function confirm(acknowledged: boolean) {
    if (!h || !confirmation || !acknowledged || review.busy || review.intent || !review.fresh) return;
    try {
      const intent = buildDeliveryIntent(h, confirmation, notes, raw, acknowledged, crypto.randomUUID());
      setConfirmation(null); setInputError('');
      void review.send(intent).then(confirmed => { if (confirmed) { setRaw(''); setNotes(''); } });
    } catch (cause) { setConfirmation(null); setInputError(cause instanceof Error ? cause.message : 'Check the input before continuing.'); }
  }
  return <section className={styles.section} aria-labelledby={heading}>
    <div className={styles.sectionHeading}><h3 id={heading}>{deliverable.title}</h3><button type="button" className={styles.secondary} disabled={review.busy || confirmation !== null} onClick={() => void review.reload()}><Icon name="refresh" />Read current review</button></div>
    <p className={styles.criteria}>{deliverable.criteria}</p>
    <div ref={feedback} tabIndex={-1} className={review.error || review.feedback || inputError ? styles.notice : styles.srOnly} role={review.error || inputError ? 'alert' : 'status'}>
      {inputError || review.error}{review.feedback && <p>{review.feedback}</p>}
    </div>
    {review.busy && <p role="status">Reading or recording review…</p>}
    {!h && !review.busy && !review.error && <p>Read the current review to continue.</p>}
    {h && <>
      <p className={styles.badge}>{stateLabels[h.state]}</p>
      {!review.fresh && <p className={styles.hint}>This is the last successful server read. Actions are blocked until a fresh read succeeds.</p>}
      <p className={styles.hint}>Revisions remaining: {remaining} of {h.revision_limit}, based on server history.</p>
      {h.state === 'not_submitted' && <p>No work has been submitted for this deliverable.</p>}
      {h.state === 'accepted' && <p>The buyer accepted this version. Review is terminal; further revisions and disputes are unavailable here.</p>}
      {h.state === 'disputed' && <p className={styles.notice}>{freezeWarning}</p>}
      <VersionHistory history={h} />
      {(canSubmit || canReview || canDispute) && <div className={styles.stack}>
        {canSubmit && <div className={styles.field}>
          <label htmlFor={heading + '-artifact'}>{h.state === 'revision_requested' ? 'Revised artifact · raw JSON' : 'Artifact · raw JSON'}</label>
          <textarea id={heading + "-artifact"} value={raw} onChange={event => setRaw(event.target.value)} disabled={locked} className={styles.sourceInput} rows={8} maxLength={16384} spellCheck={false} autoComplete="off" />
          <p className={styles.hint}>Flat object of string values; at most 100 keys and 16 KiB. The raw JSON is sent unchanged so the server can reject duplicate keys and malformed Unicode. Do not include secrets.</p>
        </div>}
        <div className={styles.field}>
          <label htmlFor={heading + "-notes"}>Review notes (optional)</label><textarea id={heading + "-notes"} value={notes} onChange={event => setNotes(event.target.value)} disabled={locked} maxLength={2000} rows={3} autoComplete="off" />
          <p className={styles.hint}>Visible to both participants; retained in immutable history. At most 2000 characters.</p>
        </div>
        <div className={styles.actions}>
          {canSubmit && <button type="button" className={styles.primary} disabled={locked || !raw.trim()} onClick={() => setConfirmation('submit')}>{h.state === 'revision_requested' ? 'Review revision submission' : 'Review submission'}</button>}
          {canReview && <><button type="button" className={styles.primary} disabled={locked} onClick={() => setConfirmation('accept')}>Accept latest version…</button><button type="button" className={styles.secondary} disabled={locked || remaining === 0} onClick={() => setConfirmation('request_revision')}>Request revision…</button></>}
          {canDispute && <button type="button" className={styles.danger} disabled={locked} onClick={() => setConfirmation('dispute')}><Icon name="info" />Flag dispute…</button>}
        </div>
        {canReview && remaining === 0 && <p className={styles.hint}>No revisions remain under the accepted terms. Another revision cannot be requested.</p>}
        {canDispute && <p className={styles.hint}>{freezeWarning}</p>}
      </div>}
    </>}
    {review.intent && <div className={styles.notice}>
      <p>Unresolved intent: {actionLabels[review.intent.action]}. New edits remain blocked. Retry first reads the server, then sends only the retained original key and payload.</p>
      <button type="button" className={styles.secondary} disabled={review.busy} onClick={() => void review.send()}>Read server and retry same intent</button>
      <p className={styles.hint}>Leaving this view or changing account clears the in-memory intent. After returning, inspect the current history before considering another action.</p>
    </div>}
    {confirmation && h && <ReviewConfirmation action={confirmation} history={h} notes={notes} raw={raw} onCancel={() => setConfirmation(null)} onConfirm={confirm} />}
  </section>;
}

function VersionHistory({ history }: { history: DeliveryHistory }) {
  return <div className={styles.stack}>{history.submissions.map(submission => <article key={submission.version} className={styles.deliverable}>
    <h4>Version {submission.version}{submission.version === history.latest_version ? ' · latest' : ''}</h4>
    <p className={styles.hint}>Submitted by <code className={styles.fullValue}>{submission.actor}</code> · <TaskTime value={submission.created_at} /></p>
    <p className={styles.hint}>Artifact SHA-256: <code className={styles.fullValue}>{submission.artifact_hash}</code></p>
    <p className={styles.hint}>Manifest SHA-256: <code className={styles.fullValue}>{submission.manifest_hash}</code></p>
    {submission.notes && <p className={styles.criteria}>{submission.notes}</p>}
    <details className={styles.disclosure}><summary>View stored artifact JSON</summary><pre className={styles.source} tabIndex={0}>{JSON.stringify(submission.artifact, null, 2)}</pre></details>
    <CheckerEvidence submission={submission} />
    {history.reviews.filter(r => r.version === submission.version).map(r => <div key={r.version} className={styles.notice}>
      <p>{r.decision === 'accept' ? 'Buyer accepted this version' : 'Buyer requested revision'} · <TaskTime value={r.created_at} /></p>
      <p className={styles.hint}>Recorded by <code className={styles.fullValue}>{r.actor}</code> for artifact <code className={styles.fullValue}>{r.artifact_hash}</code></p>
      {r.notes && <p className={styles.criteria}>{r.notes}</p>}
    </div>)}
    {history.disputes.filter(d => d.version === submission.version).map(d => <div key={d.version} className={styles.notice}>
      <p>Participant dispute flag · <TaskTime value={d.created_at} /></p>
      <p className={styles.hint}>Flagged by <code className={styles.fullValue}>{d.actor}</code> for artifact <code className={styles.fullValue}>{d.artifact_hash}</code>. This flag is not a verified finding.</p>
      {d.notes && <p className={styles.criteria}>{d.notes}</p>}
    </div>)}
  </article>)}</div>;
}
function CheckerEvidence({ submission }: { submission: DeliverySubmission }) {
  const { checker } = submission;
  const output = checker.output;
  return <details className={styles.disclosure}>
    <summary>Actual checker evidence · {'error' in output ? 'input rejected' : output.passed ? 'metadata checks passed' : 'metadata checks failed'}</summary>
    <div className={styles.stack}>
      <p className={styles.hint}>Default metadata only: key parity and nonblank values. These are not inferred agreed acceptance criteria. No placeholder or term requirements were inferred from prose. Human review is still required; checker failure does not block it.</p>
      <p className={styles.hint}>Recorded checker HTTP status: {checker.http_status}. AI review is not configured.</p>
      {'error' in output ? <p className={styles.error}>{output.error.code}: {output.error.message}</p> : <ul className="grid gap-2 pl-5">
        {output.checks.map((check, index) => <li key={index}><code>{check.key}</code> · {check.id} · {check.status}: {check.message}</li>)}
      </ul>}
      <pre className={styles.source} tabIndex={0}>{JSON.stringify(checker, null, 2)}</pre>
    </div>
  </details>;
}
function ReviewConfirmation({ action, history, notes, raw, onCancel, onConfirm }: { action: DeliveryAction; history: DeliveryHistory; notes: string; raw: string; onCancel: () => void; onConfirm: (acknowledged: boolean) => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [returnTarget] = useState(() => typeof document !== "undefined" ? document.activeElement as HTMLElement | null : null);
  const acknowledgmentId = useId();
  return <Dialog.Root open onOpenChange={open => { if (!open) onCancel(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40" />
    <Dialog.Content onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => { if (returnTarget?.isConnected && !returnTarget.hasAttribute("disabled")) returnTarget.focus({ preventScroll: true }); else document.getElementById("main-content")?.focus({ preventScroll: true }); }); }} className="fixed top-1/2 left-1/2 z-[101] max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-6 text-[var(--body)] shadow-xl">
      <div className={styles.stack}>
        <Dialog.Title className="text-xl font-semibold">{actionLabels[action]}?</Dialog.Title>
        <Dialog.Description>{warning}</Dialog.Description>
        {action === 'dispute' ? <p className={styles.notice}>{freezeWarning}</p> : action === 'accept' ? <p>Accepting is terminal for this deliverable, including against later disputes. This records human review only.</p> : action === 'request_revision' ? <p>Ask the worker for a voluntary revision. Revisions remaining: {deliveryRevisionsRemaining(history)}.</p> : <p>This creates an immutable version, visible to both participants. It does not create an obligation to continue working.</p>}
        <p>Current version: {history.latest_version === 0 ? 'none (initial submission)' : history.latest_version}</p>
        <p className={styles.hint}>Exact latest artifact hash: <code className={styles.fullValue}>{history.latest_artifact_hash || '(none)'}</code></p>
        <p className={styles.hint}>Exact manifest hash: <code className={styles.fullValue}>{history.manifest_hash}</code></p>
        {action === 'submit' && <details className={styles.disclosure}><summary>Review exact raw JSON to submit</summary><pre className={styles.source} tabIndex={0}>{raw}</pre></details>}
        {notes && <p className={styles.criteria}>{notes}</p>}
        <label htmlFor={acknowledgmentId} className="flex min-h-11 cursor-pointer items-start gap-3 rounded p-2">
          <Checkbox.Root id={acknowledgmentId} checked={acknowledged} onCheckedChange={value => setAcknowledged(value === true)} className="mt-1 flex size-6 min-h-6 shrink-0 items-center justify-center rounded border border-[var(--control-border)] bg-canvas p-0 data-[state=checked]:bg-coral"><Checkbox.Indicator><Icon name="check" /></Checkbox.Indicator></Checkbox.Root>
          <span>I understand this is voluntary unfunded review: no deposit, no obligation to start work, and no financial deadlines.</span>
        </label>
        <div className={styles.actions}><button type="button" autoFocus className={styles.secondary} onClick={onCancel}>Go back</button><button type="button" className={action === 'dispute' ? styles.danger : styles.primary} disabled={!acknowledged} onClick={() => onConfirm(acknowledged)}>Confirm {actionLabels[action].toLowerCase()}</button></div>
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
