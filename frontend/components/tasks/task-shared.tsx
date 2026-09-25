'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useWorkspace } from '../workspace-provider';
import { WalletControl } from '../wallet-control';
import Link from 'next/link';
import { Icon } from '../ui';
import { WorkspaceError, workspaceRequest } from '../../lib/workspace-client';
import type { Task } from '../../lib/workspace-types';
import styles from './task-styles';
import { Dialog } from 'radix-ui';

export function TaskButton({ children, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} {...props}><span className={styles.buttonContent}>{children}</span></button>;
}

// Mount for one immutable intent. The caller retains all role/transport checks.
export function WorkspaceConfirmation({ title, description, acknowledgement, confirmLabel, children, onDismiss, onConfirm }: {
  title: string; description: string; acknowledgement: string; confirmLabel: string;
  children?: ReactNode; onDismiss: () => void; onConfirm: (acknowledged: boolean) => void;
}) {
  const { status, address, sessionKey, config } = useWorkspace();
  const identity = `${sessionKey}:${config.chain?.id}:${address?.toLowerCase()}`;
  const initialIdentity = useRef(identity);
  const valid = config.enabled && status === 'signedIn' && Boolean(address) && identity === initialIdentity.current;
  const [acknowledged, setAcknowledged] = useState(false);
  const sent = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }, []);
  useEffect(() => { if (!valid) onDismiss(); }, [valid, onDismiss]);
  return <Dialog.Root open={valid} onOpenChange={open => { if (!open) onDismiss(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.confirmationOverlay} />
      <Dialog.Content className={styles.radixConfirmation} onOpenAutoFocus={event => { event.preventDefault(); back.current?.focus(); }} onCloseAutoFocus={event => {
        event.preventDefault();
        if (opener.current?.isConnected && !opener.current.matches(':disabled')) opener.current.focus();
        else document.getElementById('main-content')?.focus();
      }}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>{description}</Dialog.Description>
        {children}
        <label className={styles.acknowledgement}><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>{acknowledgement}</span></label>
        <div className={styles.actions}>
          <button ref={back} type="button" className={styles.secondary} onClick={onDismiss}>Go back</button>
          <TaskButton className={styles.primary} disabled={!acknowledged || !valid} onClick={() => {
            if (!acknowledged || !valid || sent.current) return;
            sent.current = true;
            onConfirm(acknowledged);
          }}>{confirmLabel}</TaskButton>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function TaskSession({ children }: { children: ReactNode }) {
  const { status, address, sessionKey, config } = useWorkspace();
  if (config.enabled && status === 'loading') return <section className={styles.workspace}><TaskLoading label="Checking your session…" /></section>;
  if (!config.enabled || status !== 'signedIn' || !address) return <section className={styles.workspace}>
    <div className={styles.accessLayout}>
      <div className={styles.accessIntro}>
        <span className={styles.accessLabel}><Icon name="lock" />Private workspace</span>
        <h2>{config.enabled ? 'Your agreements start here.' : 'Workspace setup is pending.'}</h2>
        <p>{config.enabled ? 'Sign in with the wallet named in your agreement. Your invitations and accepted terms will appear here.' : 'This environment is not ready for wallet sign-in. You can still inspect localization files in the public checker.'}</p>
        {config.enabled ? <div className={styles.accessAction}><WalletControl /><p>A login signature starts a session, not a transaction.</p></div> : <div className={styles.setupNote}><Icon name="info" /><div><strong>Configuration needed</strong><p>{config.reason || 'The workspace connection has not been configured.'}</p></div></div>}
        <Link href="/checker" className={styles.accessLink}><Icon name="checker" />Open the JSON checker<Icon name="arrow-right" /></Link>
      </div>
      <aside className={styles.accessGuide} aria-label="Workspace access guide">
        <h3>Before you enter</h3>
        <dl>
          <div><dt><Icon name="wallet" />Use the invited wallet</dt><dd>Connect through the wallet picker. Connecting alone does not sign you in.</dd></div>
          <div><dt><Icon name="lock" />Review the login message</dt><dd>Check the site and wallet details before signing. No deposit is requested.</dd></div>
          <div><dt><Icon name="tasks" />Read the agreement</dt><dd>Buyer and worker see the same source, deliverables, and acceptance criteria.</dd></div>
        </dl>
        <p>Task access is limited to its buyer and worker.</p>
      </aside>
    </div>
  </section>;
  return <section className={styles.workspace} key={sessionKey + ':' + address.toLowerCase()}>{children}</section>;
}

export function SessionExpired() {
  return <div className={styles.empty}><h2>Session expired</h2><p>Private task data has been cleared. Sign in again to continue. If your wallet still shows a session, sign out first.</p><WalletControl /></div>;
}

export function TaskLoading({ label = 'Loading tasks…' }: { label?: string }) {
  return <div className={styles.loading} role="status" aria-live="polite"><p>{label}</p><div aria-hidden="true" className={styles.skeleton} /><div aria-hidden="true" className={styles.skeleton} /><div aria-hidden="true" className={styles.skeleton} /></div>;
}

export function taskErrorStatus(error: unknown): number {
  return error instanceof WorkspaceError ? error.status : 0;
}

export function taskErrorMessage(error: unknown): string {
  switch (taskErrorStatus(error)) {
    case 400: return 'The server rejected these terms. Check all fields and the deadline, then review again.';
    case 401: return 'Your session has expired. Sign in again.';
    case 403: return 'This action is not available to your account.';
    case 404: return 'Task not found or not available to this account.';
    case 409: return 'The task changed, the invitation expired, or the terms no longer match. Read the current task before acting again.';
    case 413: return 'The request is too large. Reduce the source or criteria text.';
    case 429: return 'Too many requests. Wait a moment, then try again manually.';
    case 503: return 'The workspace is unavailable. Check your connection and try again later.';
    default: return 'Could not reach the workspace or read its response. Please try again manually.';
  }
}

export function useTaskResource<Result>(path: string) {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const active = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => { active.current?.abort(); }, []);
  const reload = useCallback(async (): Promise<Result | null> => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await workspaceRequest<Result>(path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (controller.signal.aborted || active.current !== controller) return null;
      setData(result);
      return result;
    } catch (cause) {
      if (!controller.signal.aborted && active.current === controller) {
        setError(cause);
        if ([401, 403, 404].includes(taskErrorStatus(cause))) setData(null);
      }
      return null;
    } finally {
      if (!controller.signal.aborted && active.current === controller) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
    return () => { active.current?.abort(); };
  }, [reload]);
  return { data, setData, error, loading, reload };
}

export function useTaskClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, []);
  return now;
}

export function taskDisplayStatus(task: Task, now: number): Task['status'] | 'expired' {
  return task.status === 'invited' && Date.parse(task.invite_expires_at) <= now ? 'expired' : task.status;
}

export function TaskStatusBadge({ task, now }: { task: Task; now: number }) {
  const status = taskDisplayStatus(task, now);
  const labels = { invited: 'Awaiting acceptance', expired: 'Expired · local clock', cancelled: 'Cancelled', accepted_unfunded: 'Accepted · unfunded' };
  return <span className={styles.badge} data-status={status}><Icon name={status === 'accepted_unfunded' ? 'check' : status === 'cancelled' ? 'close' : 'clock'} />{labels[status]}</span>;
}

export function TaskTime({ value }: { value: string }) {
  const date = new Date(value);
  return <time dateTime={value} title={value}>{date.toLocaleString('en-GB', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })} UTC</time>;
}

export function CopyValue({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  useLayoutEffect(() => () => { generation.current++; if (reset.current) clearTimeout(reset.current); }, []);
  async function copy() {
    const current = ++generation.current;
    if (reset.current) clearTimeout(reset.current);
    try {
      await navigator.clipboard.writeText(value);
      if (current !== generation.current) return;
      setState('copied');
      reset.current = setTimeout(() => setState('idle'), 2000);
    } catch { if (current === generation.current) setState('failed'); }
  }
  return <div className={styles.copyRow}><code className={styles.fullValue}>{value}</code><TaskButton className={styles.copyButton} type="button" aria-label={'Copy ' + label} onClick={() => void copy()}><Icon name={state === 'copied' ? 'check' : 'copy'} /><span aria-live="polite">{state === 'copied' ? 'Copied' : 'Copy'}</span></TaskButton>{state === 'failed' && <p className={styles.error} role="alert">Copy failed. Select and copy the full value instead.</p>}</div>;
}
