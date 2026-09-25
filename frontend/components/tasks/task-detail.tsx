'use client';

import Link from 'next/link';
import { Icon } from '../ui';
import { canAnimate, runMotion, type MotionHandle } from '../../lib/motion';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useWorkspace } from '../workspace-provider';
import { workspaceRequest } from '../../lib/workspace-client';
import type { Task } from '../../lib/workspace-types';
import { ManifestDetails } from './manifest-details';
import { DeliveryReview } from './delivery-review';
import { TaskOnchain } from '../onchain/task-actions';
import { TaskButton, CopyValue, SessionExpired, TaskLoading, TaskSession, TaskStatusBadge, TaskTime, taskDisplayStatus, taskErrorMessage, taskErrorStatus, useTaskClock, useTaskResource } from './task-shared';
import styles from './task-styles';

export default function TaskDetailView({ id }: { id: string }) {
  const validId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
  return <TaskSession>{validId ? <TaskDetail key={id} id={id} /> : <div className={styles.empty}><h2>Task not found or unavailable</h2><p>This task may not exist or may not be available to this account.</p><Link href="/tasks" className={styles.textLink}>Back to tasks</Link></div>}</TaskSession>;
}

function TaskDetail({ id }: { id: string }) {
  const { address } = useWorkspace();
  const { data: task, setData, error, loading, reload } = useTaskResource<Task>('/tasks/' + id);
  const now = useTaskClock();
  const [pending, setPending] = useState<'accept' | 'cancel' | 'readback' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [confirmation, setConfirmation] = useState<{ action: 'accept' | 'cancel'; pointer: boolean; task: Task } | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => () => { mutation.current?.abort(); }, []);
  useEffect(() => { if (feedback || actionError) feedbackRef.current?.focus(); }, [feedback, actionError]);

  async function act(action: 'accept' | 'cancel', reviewed: Task) {
    if (!task || loading || mutation.current || pending || error) return;
    const actor = action === 'accept' ? task.manifest.worker : task.manifest.buyer;
    if (task.id !== reviewed.id || task.manifest_hash !== reviewed.manifest_hash || task.status !== 'invited' || actor.toLowerCase() !== address?.toLowerCase()) {
      setActionError('This action no longer matches the current task. Read the task again before continuing.');
      void reload();
      return;
    }
    if (action === 'accept' && Date.parse(task.invite_expires_at) <= Date.now()) {
      setActionError('This invitation has expired according to your device clock. Read the current task before continuing.');
      void reload();
      return;
    }
    const controller = new AbortController();
    mutation.current = controller;
    setPending(action);
    setFeedback('');
    setActionError('');
    try {
      const current = await workspaceRequest<Task>('/tasks/' + id + '/' + action, {
        method: 'POST', body: action === 'accept' ? JSON.stringify({ manifest_hash: reviewed.manifest_hash }) : '{}',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      if (controller.signal.aborted) return;
      setData(current);
      setFeedback(action === 'accept' ? 'Workspace acceptance confirmed. Check the onchain panel separately for funding status.' : 'Cancellation confirmed by the server.');
    } catch (cause) {
      if (controller.signal.aborted) return;
      const status = taskErrorStatus(cause);
      if (status === 401) { setData(null); setSessionExpired(true); return; }
      if (status === 409 || status === 0 || status >= 500 || status === 408) {
        setPending('readback');
        setFeedback('The action result is uncertain or conflicted. Reading the current task…');
        const current = await reload();
        if (controller.signal.aborted) return;
        setFeedback(current ? 'Current server state loaded below. The previous action was not retried.' : 'Could not confirm the current task state. No action was retried. Read the task again before taking another action.');
      } else {
        if (status === 403 || status === 404) setData(null);
        setActionError(taskErrorMessage(cause));
      }
    } finally {
      if (!controller.signal.aborted) { mutation.current = null; setPending(null); }
    }
  }

  if (sessionExpired || taskErrorStatus(error) === 401) return <SessionExpired />;
  const isBuyer = task?.manifest.buyer.toLowerCase() === address?.toLowerCase();
  const isWorker = task?.manifest.worker.toLowerCase() === address?.toLowerCase();
  const visibleTask = task && (isBuyer || isWorker) ? task : null;
  return <div className={styles.stack}>
    <div className={styles.toolbar}><Link className={styles.textLink} href="/tasks"><Icon name="arrow-left" />All agreements</Link><TaskButton type="button" className={styles.secondary} disabled={loading || pending !== null} onClick={() => void reload()}><Icon name="refresh" />{loading && task ? 'Reading task…' : 'Read current task'}</TaskButton></div>
    <div id="task-action-feedback" ref={feedbackRef} tabIndex={-1} className={feedback || actionError ? styles.notice : styles.srOnly} role={actionError ? 'alert' : 'status'}>{actionError || feedback}</div>
    {error != null && <div role="alert" className={styles.errorBox}><p>{taskErrorMessage(error)}</p>{visibleTask && <p>These terms are from the last successful read. Actions stay blocked until a fresh read succeeds.</p>}</div>}
    {loading && !task ? <TaskLoading label="Loading agreement…" /> : visibleTask ? <>
      <div className={styles.detailHeading}><TaskStatusBadge task={visibleTask} now={now} /><p className={styles.hint}>You are the {isBuyer ? 'buyer' : 'worker'}.</p></div>
      <dl className={styles.policyGrid}><div><dt>Created</dt><dd><TaskTime value={visibleTask.created_at} /></dd></div><div><dt>Invitation expires</dt><dd><TaskTime value={visibleTask.invite_expires_at} /></dd></div></dl>
      {taskDisplayStatus(visibleTask, now) === 'expired' && <p className={styles.notice}>Expired according to your device clock. The server is authoritative. The buyer may still cancel this invitation.</p>}
      <ManifestDetails terms={visibleTask.manifest} manifest={visibleTask.manifest} buyer={visibleTask.manifest.buyer} chainId={visibleTask.manifest.chain_id} total={visibleTask.manifest.total_base_units} />
      <section className={styles.section} aria-labelledby="fingerprint-heading"><h2 id="fingerprint-heading">Terms fingerprint</h2><CopyValue value={visibleTask.manifest_hash} label="manifest hash" /><p className={styles.hint}>Exact SHA-256 content hash returned by the server. Workspace acceptance sends this exact hash; it is never recomputed in the browser. Onchain creation binds it inside a separate contract/domain-specific manifest digest.</p><details className={styles.disclosure}><summary>Full manifest JSON</summary><pre className={styles.source} tabIndex={0}><code>{JSON.stringify(visibleTask.manifest, null, 2)}</code></pre></details><p className={styles.hint}>Task ID: <code className={styles.fullValue}>{visibleTask.id}</code></p></section>
      <section className={styles.actionSection} aria-labelledby="agreement-actions"><h2 id="agreement-actions" tabIndex={-1}>Agreement actions</h2>
        {visibleTask.status === 'invited' ? <>
          <p>{isWorker ? 'Read every term and the source above before accepting. Terms cannot be edited after creation.' : 'The worker must accept these exact terms. You can cancel an invitation while its server status is invited, including after expiry.'}</p>
          {isWorker && <TaskButton type="button" className={styles.primary} disabled={pending !== null || loading || error != null || taskDisplayStatus(visibleTask, now) === 'expired'} onClick={event => setConfirmation({ action: 'accept', pointer: event.detail > 0, task: visibleTask })}>{pending === 'accept' ? 'Accepting…' : pending === 'readback' ? 'Checking state…' : 'Accept agreement'}</TaskButton>}
          {isBuyer && <TaskButton type="button" className={styles.danger} disabled={pending !== null || loading || error != null} onClick={event => setConfirmation({ action: 'cancel', pointer: event.detail > 0, task: visibleTask })}>{pending === 'cancel' ? 'Cancelling…' : pending === 'readback' ? 'Checking state…' : 'Cancel invitation'}</TaskButton>}
        </> : <p>{visibleTask.status === 'accepted_unfunded' ? 'The worker accepted this workspace agreement. This application status does not track deposits. Read the separate onchain panel for verified funding and settlement state.' : 'This invitation has been cancelled. It cannot be reopened or edited.'}</p>}
        <p className={styles.hint}>The standalone checker does not submit work or accept an agreement.</p>
      </section>
      <TaskOnchain task={visibleTask} />
      <DeliveryReview task={visibleTask} />
    </> : !loading && !error && !actionError && <div className={styles.empty}><h2>Task not found or unavailable</h2><p>This task may not exist or may not be available to this account.</p></div>}
    {confirmation && <AgreementConfirmation {...confirmation} onDismiss={message => { setConfirmation(null); if (message) setActionError(message); }} onConfirm={() => void act(confirmation.action, confirmation.task)} />}
  </div>;
}

function AgreementConfirmation({ action, task, pointer, onDismiss, onConfirm }: { action: 'accept' | 'cancel'; task: Task; pointer: boolean; onDismiss: (message?: string) => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const animation = useRef<MotionHandle | null>(null);
  const closing = useRef(false);
  const finished = useRef(false);
  const confirmed = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  function stopMotion() {
    animation.current?.cancel();
    animation.current = null;
  }

  function finish() {
    if (finished.current) return;
    finished.current = true;
    stopMotion();
    dialog.current?.close();
    onDismiss();
    const feedbackTarget = document.getElementById('task-action-feedback');
    const target = !confirmed.current && opener.current?.isConnected && !(opener.current instanceof HTMLButtonElement && opener.current.disabled)
      ? opener.current : feedbackTarget?.textContent?.trim() ? feedbackTarget : document.getElementById('agreement-actions') ?? document.getElementById('main-content');
    target?.focus({ preventScroll: true });
  }

  function close(withMotion: boolean) {
    if (finished.current) return;
    const element = dialog.current;
    if (!element || !canAnimate(withMotion, window.matchMedia('(prefers-reduced-motion: reduce)').matches, document.hidden)) { if (element) element.dataset.motion = 'instant'; finish(); return; }
    if (closing.current) return;
    closing.current = true;
    setIsClosing(true);
    const current = getComputedStyle(element);
    const from = { opacity: current.opacity, transform: current.transform };
    stopMotion();
    element.dataset.state = 'closing';
    element.dataset.motion = 'pointer';
    animation.current = runMotion(element, [from, { opacity: 0, transform: 'translateY(8px) scale(0.98)' }], {
      duration: Number.parseFloat(current.getPropertyValue('--duration-enter')) || 160,
      easing: current.getPropertyValue('--ease-out').trim(), fill: 'both',
    }, finish);
  }

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    finished.current = false;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    element.dataset.state = 'open';
    element.dataset.motion = canAnimate(pointer, window.matchMedia('(prefers-reduced-motion: reduce)').matches, document.hidden) ? 'pointer' : 'instant';
    try { element.showModal(); } catch {
      document.documentElement.style.overflow = previousOverflow;
      onDismiss('Could not open the confirmation dialog. No action was sent. Please try a browser with native dialog support.');
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (canAnimate(pointer, reduced.matches, document.hidden)) {
      const style = getComputedStyle(element);
      try {
        animation.current = runMotion(element, [{ opacity: 0, transform: 'translateY(8px) scale(0.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: Number.parseFloat(style.getPropertyValue('--duration-panel')) || 220, easing: style.getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.23, 1, 0.32, 1)' });
      } catch { stopMotion(); }
    }
    const settle = () => {
      if (!reduced.matches && !document.hidden) return;
      element.dataset.motion = 'instant';
      if (closing.current) finish();
      else stopMotion();
    };
    reduced.addEventListener('change', settle);
    document.addEventListener('visibilitychange', settle);
    return () => {
      finished.current = true;
      stopMotion();
      reduced.removeEventListener('change', settle);
      document.removeEventListener('visibilitychange', settle);
      element.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

  return <dialog ref={dialog} className={styles.confirmation} aria-labelledby={titleId} aria-describedby={descriptionId} onClose={() => { if (!dialog.current?.open && !finished.current) finish(); }} onCancel={event => { event.preventDefault(); close(false); }}>
    <h2 id={titleId}>{action === 'accept' ? 'Accept this agreement?' : 'Cancel this invitation?'}</h2>
    <p className={styles.taskTitle}>{task.manifest.title}</p>
    <p id={descriptionId}>{action === 'accept' ? 'You are accepting every term in this immutable agreement. This records acceptance only; the task stays unfunded.' : 'This closes the invitation and cannot be undone. No funds will move.'}</p>
    <div><p className={styles.label}>Exact terms fingerprint · SHA-256</p><code className={styles.fullValue}>{task.manifest_hash}</code></div>
    <p className={styles.notice}>Unfunded · no deposit or payout. This fingerprint is not an onchain commitment.</p>
    <div className={styles.actions}><TaskButton type="button" className={styles.secondary} autoFocus disabled={isClosing} onClick={event => close(event.detail > 0)}>Go back</TaskButton><TaskButton type="button" className={action === 'accept' ? styles.primary : styles.danger} disabled={isClosing} onClick={event => { if (closing.current || confirmed.current) return; confirmed.current = true; onConfirm(); close(event.detail > 0); }}>{action === 'accept' ? 'Confirm acceptance' : 'Confirm cancellation'}</TaskButton></div>
  </dialog>;
}
