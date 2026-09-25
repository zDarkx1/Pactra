'use client';

import Link from 'next/link';
import { Icon } from '../ui';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useWorkspace } from '../workspace-provider';
import { createTaskAttempt, workspaceRequest } from '../../lib/workspace-client';
import { buildDraftRequest, criteriaDiff, summarizeCriteria, validateCriteria, type CriteriaDraft as CriteriaDraftResponse, type CriteriaV1 } from '../../lib/criteria';
import { createRequestGuard } from '../../app/checker/model';
import { deadlineToUtc, isTaskAddress, newDeliverable, newTaskDraft, validateTaskDraft, type DeliverableDraft, type TaskDraft, type TaskFormErrors, type TaskValidation } from '../../lib/task-form';
import { ManifestDetails } from './manifest-details';
import { TaskButton, SessionExpired, TaskSession, WorkspaceConfirmation, taskErrorMessage, taskErrorStatus } from './task-shared';
import styles from './task-styles';

function FormField({ name, label, help, error, children }: { name: string; label: string; help?: string; error?: string; children: ReactNode }) {
  return <div className={styles.field}><label htmlFor={name}>{label}</label>{children}{help && <p id={name + '-help'} className={styles.hint}>{help}</p>}{error && <p id={name + '-error'} className={styles.error}>{error}</p>}</div>;
}

function draftParams(draft: CriteriaV1, id: string): Record<string, unknown> {
  return draft.checks.find(check => check.id === id)?.params ?? {};
}

function splitTerms(value: string): string[] {
  return value.split(',').map(term => term.trim()).filter(term => term !== '');
}

// Memory-only AI draft assistant: brief goes to POST /api/v1/criteria/draft via
// the BFF only after explicit consent. The response is validated before display,
// so a fabricated draft can never appear. Edits stay local until applied.
function CriteriaDraft({ index, onApply }: { index: number; onApply: (json: string) => void }) {
  const prefix = 'deliverables.' + index + '.criteria-draft';
  const [brief, setBrief] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<CriteriaV1 | null>(null);
  const [base, setBase] = useState<CriteriaV1 | null>(null);
  const [termsText, setTermsText] = useState('');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [promptText, setPromptText] = useState('');
  const [guard] = useState(createRequestGuard);
  useEffect(() => () => guard.cancel(), [guard]);

  function receive(criteria: CriteriaV1) {
    const copy = JSON.parse(JSON.stringify(criteria)) as CriteriaV1;
    setBase(criteria);
    setDraft(copy);
    const terms = draftParams(copy, 'required_terms').terms;
    setTermsText(Array.isArray(terms) ? (terms as string[]).join(', ') : '');
    const bounds = draftParams(copy, 'length_bounds');
    setMinText(typeof bounds.min === 'number' ? String(bounds.min) : '');
    setMaxText(typeof bounds.max === 'number' ? String(bounds.max) : '');
    const review = draftParams(copy, 'human_review');
    setPromptText(typeof review.prompt === 'string' ? review.prompt : '');
    setError('');
  }

  async function generate() {
    if (busy || !consent) return;
    let body: string;
    try { body = buildDraftRequest(brief); } catch (cause) { setError((cause as Error).message); return; }
    const pending = guard.begin();
    setBusy(true);
    setError('');
    try {
      const result = await workspaceRequest<CriteriaDraftResponse>('/criteria/draft', { method: 'POST', body, signal: pending.signal });
      if (pending.isCurrent()) receive(result.criteria);
    } catch (cause) {
      if (pending.isCurrent()) setError(cause instanceof Error ? cause.message : 'The AI draft is unavailable. Enter criteria manually.');
    } finally {
      if (pending.isCurrent()) setBusy(false);
    }
  }

  function cancel() {
    guard.cancel();
    setBusy(false);
  }

  function patch(id: string, params: Record<string, unknown>) {
    setDraft(current => current ? { ...current, checks: current.checks.map(check => check.id === id ? { ...check, params } : check) } : current);
  }

  function applyDraft() {
    if (!draft) return;
    try {
      onApply(JSON.stringify(validateCriteria(draft)));
      setError('');
    } catch (cause) { setError((cause as Error).message); }
  }

  let draftError = '';
  if (draft) {
    try { validateCriteria(draft); } catch (cause) { draftError = (cause as Error).message; }
  }
  const diff = draft && base ? criteriaDiff(base, draft) : [];
  const hasTerms = draft?.checks.some(check => check.id === 'required_terms') ?? false;
  const hasPlaceholders = draft?.checks.some(check => check.id === 'placeholders') ?? false;
  const hasBounds = draft?.checks.some(check => check.id === 'length_bounds') ?? false;
  const hasReview = draft?.checks.some(check => check.id === 'human_review') ?? false;

  return <div className={styles.stack}>
    <FormField name={prefix + '-brief'} label="Criteria brief for AI draft" help="Optional. Sent to the AI provider only after you consent below. The AI returns an editable draft; nothing binds until you apply it and freeze the agreement.">
      <textarea id={prefix + '-brief'} name={prefix + '-brief'} rows={3} maxLength={4000} value={brief} onChange={event => { setBrief(event.target.value); setError(''); }} placeholder="Describe the work in plain words, e.g. translate the greeting keeping {name} and the term Pactra" />
    </FormField>
    <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Send this brief to the configured AI provider. Do not include private or sensitive content.</span></label>
    <div className={styles.actions}>
      <TaskButton type="button" className={styles.secondary} disabled={!brief.trim() || !consent || busy} aria-busy={busy} onClick={() => void generate()}>{busy ? 'Requesting draft…' : 'Generate draft'}</TaskButton>
      {busy && <TaskButton type="button" className={styles.secondary} onClick={cancel}>Cancel draft</TaskButton>}
      <span className={styles.hint} role="status">{busy ? 'Waiting for the draft. The agreement draft is unaffected.' : draft ? 'Draft received. Review and edit every value before applying.' : 'No draft requested yet.'}</span>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {draft && <div className={styles.stack}>
      <p className={styles.hint}>{summarizeCriteria(draft)} Values came from the AI draft and stay editable until you apply them.</p>
      {hasTerms && <FormField name={prefix + '-terms'} label="Required terms" help="Comma-separated. Spaces around commas are removed; matching stays literal.">
        <input id={prefix + '-terms'} name={prefix + '-terms'} value={termsText} onChange={event => { setTermsText(event.target.value); patch('required_terms', { terms: splitTerms(event.target.value) }); }} placeholder="Pactra, invoice" autoComplete="off" />
      </FormField>}
      {hasPlaceholders && <div><label htmlFor={prefix + '-placeholders'}><input id={prefix + '-placeholders'} type="checkbox" checked={Boolean(draftParams(draft, 'placeholders').enabled)} onChange={event => patch('placeholders', { enabled: event.target.checked })} /> Preserve placeholders such as {'{name}'} across submission.</label></div>}
      {hasBounds && <div className={styles.fieldGrid}>
        <FormField name={prefix + '-min'} label="Minimum length" help="Whole characters, at least 0."><input id={prefix + '-min'} name={prefix + '-min'} inputMode="numeric" value={minText} onChange={event => { setMinText(event.target.value); patch('length_bounds', { min: /^\d+$/.test(event.target.value) ? Number(event.target.value) : NaN, max: draftParams(draft, 'length_bounds').max }); }} autoComplete="off" /></FormField>
        <FormField name={prefix + '-max'} label="Maximum length" help="Whole characters, at most 4000."><input id={prefix + '-max'} name={prefix + '-max'} inputMode="numeric" value={maxText} onChange={event => { setMaxText(event.target.value); patch('length_bounds', { min: draftParams(draft, 'length_bounds').min, max: /^\d+$/.test(event.target.value) ? Number(event.target.value) : NaN }); }} autoComplete="off" /></FormField>
      </div>}
      {hasReview && <><FormField name={prefix + '-prompt'} label="Human review prompt" help="At most 500 characters. Shown to the human reviewer.">
        <input id={prefix + '-prompt'} name={prefix + '-prompt'} maxLength={500} value={promptText} onChange={event => { setPromptText(event.target.value); patch('human_review', { ...draftParams(draft, 'human_review'), prompt: event.target.value }); }} autoComplete="off" />
      </FormField>
      <div><label htmlFor={prefix + '-required'}><input id={prefix + '-required'} type="checkbox" checked={Boolean(draftParams(draft, 'human_review').required)} onChange={event => patch('human_review', { ...draftParams(draft, 'human_review'), required: event.target.checked })} /> Human review is required before acceptance.</label></div></>}
      <details className={styles.disclosure}><summary>View draft JSON preview</summary><pre className={styles.source} tabIndex={0} aria-label="Draft criteria JSON preview"><code>{JSON.stringify(draft, null, 2)}</code></pre></details>
      {diff.length > 0 ? <ul className="grid gap-2 pl-5">{diff.map(line => <li key={line}>{line}</li>)}</ul> : <p className={styles.hint}>No manual changes yet. The preview matches the AI draft.</p>}
      {draftError && <p className={styles.error}>{draftError}</p>}
      <div className={styles.actions}>
        <TaskButton type="button" className={styles.primary} disabled={busy || Boolean(draftError)} onClick={applyDraft}>Use draft as criteria</TaskButton>
        <span className={styles.hint}>Replaces the acceptance criteria above and returns the agreement to edit. You can still edit the text before reviewing.</span>
      </div>
    </div>}
  </div>;
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
  const [confirming, setConfirming] = useState(false);
  const [animatedRow, setAnimatedRow] = useState<number | null>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const mutation = useRef<AbortController | null>(null);
  const attempt = useRef<ReturnType<typeof createTaskAttempt> | null>(null);
  const focusNext = useRef<string | null>(null);
  const sequence = useRef(1);
  const allowed = [...new Set(config.arbiters.filter(isTaskAddress).map(value => value.toLowerCase()))];
  const available = allowed.filter(value => value !== address?.toLowerCase() && value !== draft.worker.toLowerCase());
  const blocked = !config.chain || allowed.length < 2;

  useLayoutEffect(() => () => { mutation.current?.abort(); attempt.current?.dispose(); }, []);
  useEffect(() => { if (Object.keys(errors).length || serverError || uncertain) errorSummary.current?.focus(); }, [errors, serverError, uncertain]);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  useLayoutEffect(() => {
    if (focusNext.current) { document.getElementById(focusNext.current)?.focus(); focusNext.current = null; }
  }, [draft.deliverables.length, review]);

  function updateField(field: Exclude<keyof TaskDraft, 'deliverables'>, value: string) {
    if (pending || uncertain || mutation.current) return;
    setDraft(current => ({ ...current, [field]: value }));
    setReview(null);
    setServerError('');
    setErrors(current => { const next = { ...current }; delete next[field]; delete next._form; return next; });
  }

  function updateDeliverable(index: number, field: keyof DeliverableDraft, value: string) {
    if (pending || uncertain || mutation.current) return;
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
    if (!review || blocked || pending || mutation.current || !address) return;
    if (!attempt.current) {
      const checked = validateTaskDraft(draft, address, allowed);
      if (!checked.ok) { setReview(null); setErrors(checked.errors); return; }
      if (checked.body !== review.body) { setReview(checked); setServerError('Terms changed. Review this updated agreement before creating it.'); return; }
      attempt.current = createTaskAttempt(checked.body);
    }
    const controller = new AbortController();
    mutation.current = controller;
    setPending(true);
    setServerError('');
    try {
      const task = await attempt.current.send(controller.signal);
      if (controller.signal.aborted) return;
      router.replace('/tasks/' + task.id);
    } catch (cause) {
      if (controller.signal.aborted) return;
      const status = taskErrorStatus(cause);
      if (status === 401 || attempt.current.state === 'disposed') { attempt.current.dispose(); attempt.current = null; setDraft(newTaskDraft()); setReview(null); setExpired(true); }
      else if (attempt.current.state === 'uncertain') {
        setUncertain(true);
        setServerError('The request may have reached the server. Retry this same invitation to resolve it; the exact payload and idempotency key will be reused. Editing is locked. Nothing is retried automatically.');
      } else { attempt.current.dispose(); attempt.current = null; setUncertain(false); setServerError(taskErrorMessage(cause)); }
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
    {blocked && <section className={styles.setupPanel} aria-labelledby="arbiter-setup-heading">
      <span className={styles.accessLabel}><Icon name="info" />Operator setup needed</span>
      <h2 id="arbiter-setup-heading">Agreement creation awaiting arbiter setup</h2>
      <p>Before invitations can be created, the operator must obtain two distinct, real, consenting team arbiter wallet addresses: one primary and one backup. Both must be nonzero EVM addresses and different from the buyer and worker.</p>
      <p>Set <code>PACTRA_ARBITERS</code> to those comma-separated addresses in both the frontend and backend configuration, with matching allowlists, then restart the services. Do not use example or test wallets.</p>
      {!config.chain && <p>The operator must also configure the workspace chain to match the backend.</p>}
      <p className={styles.hint}>The form stays disabled until setup is complete. The server still validates every invitation.</p>
      <Link className={styles.textLink} href="/checker"><Icon name="checker" />Use the JSON checker while you wait<Icon name="arrow-right" /></Link>
    </section>}
    <div ref={errorSummary} tabIndex={-1} role={Object.keys(errors).length || serverError ? 'alert' : undefined} className={Object.keys(errors).length || serverError ? styles.errorBox : styles.srOnly}>
      {Object.keys(errors).length > 0 && <><h2>Check these fields</h2><ul>{Object.entries(errors).map(([name, message]) => <li key={name}>{name === '_form' ? message : <a href={'#' + name} onClick={event => { event.preventDefault(); document.getElementById(name)?.focus(); }}>{message}</a>}</li>)}</ul></>}
      {serverError && <p>{serverError}</p>}
      {uncertain && <p>Keep this page open to retain the retry key. Leaving clears it; check your task list before creating another invitation.</p>}
    </div>
    {review && config.chain && address ? <div className={styles.stack}>
      <div className={styles.sectionHeading}><h2 ref={reviewHeading} tabIndex={-1}>Review before creating</h2><span className={styles.hint}>{uncertain ? 'Creation not yet confirmed' : pending ? 'Sending' : 'Not yet sent'}</span></div>
      <ManifestDetails terms={review.input} buyer={address.toLowerCase()} chainId={config.chain.id} total={review.total} />
      <p className={styles.notice}>The server assigns the task ID, invitation expiry, and terms fingerprint after creation. The worker must separately accept that exact fingerprint.</p>
      <div className={styles.actions}><TaskButton type="button" className={styles.secondary} disabled={pending || uncertain} onClick={() => { if (mutation.current || uncertain) return; focusNext.current = 'title'; setReview(null); setServerError(''); }}>Back to edit</TaskButton><TaskButton type="button" className={styles.primary} disabled={pending || blocked} aria-busy={pending} onClick={() => { if (uncertain) void createTask(); else setConfirming(true); }}>{pending ? 'Creating invitation…' : uncertain ? 'Retry same invitation' : 'Create invitation'}</TaskButton><span className={styles.hint} role="status">{pending ? 'Waiting for the server. Please do not submit again.' : uncertain ? 'Same key and terms retained in memory. Edits remain locked.' : 'No funds will move.'}</span></div>
      {confirming && <WorkspaceConfirmation title="Create this invitation?" description="The reviewed terms will become immutable and visible to the invited worker. The worker must separately accept them." acknowledgement="I have reviewed these exact terms and understand that this creates an unfunded invitation. No deposit or payout occurs." confirmLabel="Confirm invitation" onDismiss={() => setConfirming(false)} onConfirm={acknowledged => { if (!acknowledged) return; setConfirming(false); void createTask(); }}>
        <p className={styles.notice}>Reviewing or creating an invitation does not move funds.</p>
      </WorkspaceConfirmation>}
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
              <FormField name={'deliverables.' + index + '.criteria'} label="Acceptance criteria" error={errors['deliverables.' + index + '.criteria']} help="Describe what the worker must deliver. Up to 4,000 Unicode characters, or structured criteria JSON (criteria-v1)."><textarea {...fieldProps('deliverables.' + index + '.criteria', true)} rows={4} value={item.criteria} onChange={event => updateDeliverable(index, 'criteria', event.target.value)} required /></FormField>
              <CriteriaDraft index={index} onApply={json => updateDeliverable(index, 'criteria', json)} />
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
