'use client';

import Link from 'next/link';
import { Icon } from '../ui';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useWorkspace } from '../workspace-provider';
import { workspaceRequest } from '../../lib/workspace-client';
import type { Task } from '../../lib/workspace-types';
import { deadlineToUtc, isTaskAddress, newDeliverable, newTaskDraft, validateTaskDraft, type DeliverableDraft, type TaskDraft, type TaskFormErrors, type TaskValidation } from '../../lib/task-form';
import { ManifestDetails } from './manifest-details';
import { TaskButton, SessionExpired, TaskSession, taskErrorMessage, taskErrorStatus } from './task-shared';
import styles from './task-styles';

function FormField({ name, label, help, error, children }: { name: string; label: string; help?: string; error?: string; children: ReactNode }) {
  return <div className={styles.field}><label htmlFor={name}>{label}</label>{children}{help && <p id={name + '-help'} className={styles.hint}>{help}</p>}{error && <p id={name + '-error'} className={styles.error}>{error}</p>}</div>;
}

export default function TaskFormView() {
  return <TaskSession><TaskForm /></TaskSession>;
}

function TaskForm() {
  const { address, config } = useWorkspace();
  const router = useRouter();
  const [draft, setDraft] = useState<TaskDraft>(() => newTaskDraft());
  const [errors, setErrors] = useState<TaskFormErrors>({});
  const [review, setReview] = useState<Extract<TaskValidation, { ok: true }> | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [serverError, setServerError] = useState('');
  const [expired, setExpired] = useState(false);
  const [animatedRow, setAnimatedRow] = useState<number | null>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const mutation = useRef<AbortController | null>(null);
  const focusNext = useRef<string | null>(null);
  const sequence = useRef(1);
  const allowed = [...new Set(config.arbiters.filter(isTaskAddress).map(value => value.toLowerCase()))];
  const available = allowed.filter(value => value !== address?.toLowerCase() && value !== draft.worker.toLowerCase());
  const blocked = !config.chain || allowed.length < 2;

  useLayoutEffect(() => () => { mutation.current?.abort(); }, []);
  useEffect(() => { if (Object.keys(errors).length || serverError || uncertain) errorSummary.current?.focus(); }, [errors, serverError, uncertain]);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  useLayoutEffect(() => {
    if (focusNext.current) { document.getElementById(focusNext.current)?.focus(); focusNext.current = null; }
  }, [draft.deliverables.length, review]);

  function updateField(field: Exclude<keyof TaskDraft, 'deliverables'>, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
    setReview(null);
    setServerError('');
    setErrors(current => { const next = { ...current }; delete next[field]; delete next._form; return next; });
  }

  function updateDeliverable(index: number, field: keyof DeliverableDraft, value: string) {
    setDraft(current => ({ ...current, deliverables: current.deliverables.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
    setReview(null);
    setErrors(current => { const next = { ...current }; delete next['deliverables.' + index + '.' + field]; delete next.deliverables; delete next._form; return next; });
    setServerError('');
  }

  function fieldProps(name: string, help = false) {
    return { id: name, name, 'aria-invalid': Boolean(errors[name]), 'aria-describedby': [help ? name + '-help' : '', errors[name] ? name + '-error' : ''].filter(Boolean).join(' ') || undefined };
  }

  function reviewTerms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || pending || uncertain || !address) return;
    const result = validateTaskDraft(draft, address, allowed);
    if (!result.ok) { setErrors(result.errors); return; }
    setErrors({});
    setServerError('');
    setReview(result);
  }

  async function createTask() {
    if (!review || blocked || pending || mutation.current || uncertain || !address) return;
    const checked = validateTaskDraft(draft, address, allowed);
    if (!checked.ok) { setReview(null); setErrors(checked.errors); return; }
    if (checked.body !== review.body) { setReview(checked); setServerError('Terms changed. Review this updated agreement before creating it.'); return; }
    const controller = new AbortController();
    mutation.current = controller;
    setPending(true);
    setServerError('');
    try {
      const task = await workspaceRequest<Task>('/tasks', {
        method: 'POST', body: checked.body,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      if (controller.signal.aborted) return;
      router.replace('/tasks/' + task.id);
    } catch (cause) {
      if (controller.signal.aborted) return;
      const status = taskErrorStatus(cause);
      if (status === 401) { setDraft(newTaskDraft()); setReview(null); setExpired(true); }
      else if (status === 0 || status >= 500 || status === 408 || status === 409) {
        setUncertain(true);
        setServerError('The request may have reached the server. This task was not retried. Check your task list before starting another invitation.');
      } else setServerError(taskErrorMessage(cause));
      mutation.current = null;
      setPending(false);
    }
  }

  if (expired) return <SessionExpired />;
  const deadline = deadlineToUtc(draft.delivery_deadline);
  return <div className={styles.stack}>
    <Link className={styles.textLink} href="/tasks"><Icon name="arrow-left" />All agreements</Link>
    <p className={styles.intro}>Define the work, then review the full agreement before inviting the worker.</p>
    <p className={styles.notice}>Creating a task sends an immutable invitation. It does not deposit funds. Your draft stays only in this page’s memory and is cleared when you leave or switch sessions.</p>
    {blocked && <div className={styles.errorBox} role="alert"><h2>Task creation unavailable</h2><p>{!config.chain ? 'No workspace chain is configured.' : allowed.length === 0 ? 'The official arbiter allowlist is empty. The operator must configure it before tasks can be created.' : 'At least two different official arbiters are required. Ask the operator to complete the allowlist.'}</p></div>}
    <div ref={errorSummary} tabIndex={-1} role={Object.keys(errors).length || serverError ? 'alert' : undefined} className={Object.keys(errors).length || serverError ? styles.errorBox : styles.srOnly}>
      {Object.keys(errors).length > 0 && <><h2>Check these fields</h2><ul>{Object.entries(errors).map(([name, message]) => <li key={name}>{name === '_form' ? message : <a href={'#' + name} onClick={event => { event.preventDefault(); document.getElementById(name)?.focus(); }}>{message}</a>}</li>)}</ul></>}
      {serverError && <p>{serverError}</p>}
      {uncertain && <Link prefetch={false} className={styles.textLink} href="/tasks">Check the task list · do not resend</Link>}
    </div>
    {review && config.chain && address ? <div className={styles.stack}>
      <div className={styles.sectionHeading}><h2 ref={reviewHeading} tabIndex={-1}>Review before creating</h2><span className={styles.hint}>Not yet sent</span></div>
      <ManifestDetails terms={review.input} buyer={address.toLowerCase()} chainId={config.chain.id} total={review.total} />
      <p className={styles.notice}>The server assigns the task ID, invitation expiry, and terms fingerprint after creation. The worker must separately accept that exact fingerprint.</p>
      <div className={styles.actions}><TaskButton type="button" className={styles.secondary} disabled={pending || uncertain} onClick={() => { focusNext.current = 'title'; setReview(null); setServerError(''); }}>Back to edit</TaskButton><TaskButton type="button" className={styles.primary} disabled={pending || uncertain || blocked} onClick={() => void createTask()}>{pending ? 'Creating invitation…' : 'Create invitation'}</TaskButton><span className={styles.hint} role="status">{pending ? 'Waiting for the server. Please do not submit again.' : uncertain ? 'Creation locked until you check the task list.' : 'No funds will move.'}</span></div>
    </div> : <form className={styles.form} onSubmit={reviewTerms} noValidate autoComplete="off">
      <fieldset disabled={blocked || pending || uncertain} className={styles.formBody}><legend className={styles.srOnly}>New task terms</legend>
        <section className={styles.section} aria-labelledby="work-heading"><h2 id="work-heading">The work</h2><div className={styles.stack}>
          <FormField name="title" label="Task title" error={errors.title} help="1–160 Unicode characters. This title becomes part of the immutable agreement."><input {...fieldProps('title', true)} value={draft.title} onChange={event => updateField('title', event.target.value)} required /></FormField>
          <FormField name="source" label="Source JSON" error={errors.source} help="Flat string object, up to 100 keys and 16 KiB in the server encoding. Empty objects and empty string values are allowed. Duplicate keys are rejected."><textarea {...fieldProps('source', true)} className={styles.sourceInput} spellCheck={false} rows={8} value={draft.source} onChange={event => updateField('source', event.target.value)} required /></FormField>
          <FormField name="delivery_deadline" label="Delivery deadline (UTC)" error={errors.delivery_deadline} help="Enter UTC, not your local time. Must be 1 hour–90 days ahead when the server receives the request. Leave a little margin."><input {...fieldProps('delivery_deadline', true)} type="datetime-local" step="60" value={draft.delivery_deadline} onChange={event => updateField('delivery_deadline', event.target.value)} required />{deadline && <p className={styles.hint}>UTC: <code>{deadline}</code><br />Your device time: {new Date(deadline).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'long' })}</p>}</FormField>
        </div></section>
        <section className={styles.section} aria-labelledby="people-heading"><h2 id="people-heading">Participants</h2><p className={styles.hint}>Buyer, worker, and both arbiters must be different nonzero EVM addresses.</p><p className={styles.hint}>Buyer · your signed-in wallet<br /><code className={styles.fullValue}>{address}</code></p><div className={styles.stack}>
          <FormField name="worker" label="Worker address" error={errors.worker}><input {...fieldProps('worker')} className={styles.mono} spellCheck={false} autoCapitalize="none" value={draft.worker} onChange={event => updateField('worker', event.target.value)} placeholder="0x…" required /></FormField>
          <div className={styles.fieldGrid}>{(['primary_arbiter', 'backup_arbiter'] as const).map(field => <FormField key={field} name={field} label={field === 'primary_arbiter' ? 'Primary arbiter' : 'Backup arbiter'} error={errors[field]} help="Only official allowlisted addresses may be selected."><select {...fieldProps(field, true)} className={styles.addressSelect} value={draft[field]} onChange={event => updateField(field, event.target.value)} required><option value="">Choose an official arbiter</option>{allowed.map(value => <option key={value} value={value} disabled={!available.includes(value) || value === draft[field === 'primary_arbiter' ? 'backup_arbiter' : 'primary_arbiter'].toLowerCase()}>{value}</option>)}</select></FormField>)}</div>
          {!blocked && available.length < 2 && <p className={styles.error}>This buyer/worker pair leaves fewer than two eligible arbiters. Choose a different worker or ask the operator to extend the official list.</p>}
        </div></section>
        <section className={styles.section} aria-labelledby="deliverables-label"><div className={styles.sectionHeading}><h2 id="deliverables-label">Deliverables</h2><span className={styles.hint}>{draft.deliverables.length} of 10</span></div><p className={styles.hint}>Use exact positive integer base units. No token denomination is assumed. Each amount and their sum must fit uint256.</p>
          <div id="deliverables" tabIndex={-1}>{errors.deliverables && <p className={styles.error}>{errors.deliverables}</p>}
            {draft.deliverables.map((item, index) => <fieldset className={styles.deliverableForm} key={index} data-enter={animatedRow === index || undefined}>
              <legend>Deliverable {index + 1}</legend>
              <div className={styles.fieldGrid}>{(['id', 'title'] as const).map(field => {
                const name = 'deliverables.' + index + '.' + field;
                return <FormField key={field} name={name} label={field === 'id' ? 'Unique slug ID' : 'Deliverable title'} error={errors[name]}><input {...fieldProps(name)} value={item[field]} spellCheck={field !== 'id'} onChange={event => updateDeliverable(index, field, event.target.value)} required /></FormField>;
              })}</div>
              <FormField name={'deliverables.' + index + '.criteria'} label="Acceptance criteria" error={errors['deliverables.' + index + '.criteria']} help="Describe what the worker must deliver. Up to 4,000 Unicode characters."><textarea {...fieldProps('deliverables.' + index + '.criteria', true)} rows={4} value={item.criteria} onChange={event => updateDeliverable(index, 'criteria', event.target.value)} required /></FormField>
              <div className={styles.policyFields}><FormField name={'deliverables.' + index + '.amount_base_units'} label="Allocation · base units" error={errors['deliverables.' + index + '.amount_base_units']}><input {...fieldProps('deliverables.' + index + '.amount_base_units')} className={styles.mono} inputMode="numeric" value={item.amount_base_units} onChange={event => updateDeliverable(index, 'amount_base_units', event.target.value)} required /></FormField>
                <FormField name={'deliverables.' + index + '.revision_limit'} label="Revision limit" error={errors['deliverables.' + index + '.revision_limit']}><select {...fieldProps('deliverables.' + index + '.revision_limit')} value={item.revision_limit} onChange={event => updateDeliverable(index, 'revision_limit', event.target.value)}>{[0, 1, 2, 3, 4, 5].map(value => <option value={String(value)} key={value}>{value}</option>)}</select></FormField>
                <FormField name={'deliverables.' + index + '.review_period_hours'} label="Review period · hours" error={errors['deliverables.' + index + '.review_period_hours']}><input {...fieldProps('deliverables.' + index + '.review_period_hours')} inputMode="numeric" value={item.review_period_hours} onChange={event => updateDeliverable(index, 'review_period_hours', event.target.value)} required /></FormField>
              </div>
              <div className={styles.toolbar}><p className={styles.hint}>Review window: 24–168 whole hours. Revision limit: 0–5.</p><TaskButton type="button" className={styles.secondary} disabled={draft.deliverables.length === 1} aria-label={'Remove deliverable ' + (index + 1)} onClick={() => { focusNext.current = 'deliverables.' + Math.min(index, draft.deliverables.length - 2) + '.id'; setAnimatedRow(null); setErrors({}); setDraft(current => ({ ...current, deliverables: current.deliverables.filter((_, itemIndex) => itemIndex !== index) })); }}><Icon name="close" />Remove</TaskButton></div>
            </fieldset>)}
          </div>
          <TaskButton type="button" className={styles.secondary} disabled={draft.deliverables.length >= 10} onClick={event => { const index = draft.deliverables.length; focusNext.current = 'deliverables.' + index + '.id'; setAnimatedRow(event.detail > 0 ? index : null); sequence.current++; setDraft(current => ({ ...current, deliverables: [...current.deliverables, newDeliverable(sequence.current)] })); }}><Icon name="plus" />Add deliverable</TaskButton>
          {draft.deliverables.length === 10 && <p className={styles.hint}>Maximum of 10 deliverables reached.</p>}
        </section>
        <div className={styles.actions}><TaskButton type="submit" className={styles.primary}>Review agreement</TaskButton><p className={styles.hint}>You will review all terms before anything is sent.</p></div>
      </fieldset>
    </form>}
  </div>;
}
