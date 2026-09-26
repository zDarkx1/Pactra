'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import SemanticReview from '../semantic-review';
import { invalidateResult } from '../../lib/check-input';
import { isCheckResponse } from '../../lib/check-response';
import type { CheckInput, CheckResponse, ViewState } from '../../lib/types';
import { buildEvidence, createRequestGuard, prepareCheck } from './model';
import styles from './checker-styles';

const example: CheckInput = {
  source: '{\n  "greeting": "Hello {name}",\n  "brand": "Pactra"\n}',
  submission: '{\n  "greeting": "Halo",\n  "brand": "Pactra"\n}',
  preservePlaceholders: true,
  requiredTerms: 'Pactra',
};
const labels = new Map([
  ['key_parity', 'Matching keys'], ['nonempty', 'Nonblank text'], ['placeholders', 'Placeholders'], ['required_term', 'Required term'],
]);

export default function CheckerWorkbench() {
  const [input, setInput] = useState<CheckInput>({ ...example });
  const [view, setView] = useState<ViewState>(invalidateResult);
  const [sample, setSample] = useState(true);
  const [revision, setRevision] = useState(0);
  const [invalidated, setInvalidated] = useState(false);
  const [resultMotion, setResultMotion] = useState<'pointer' | 'instant'>('instant');
  const [request] = useState(createRequestGuard);
  const [snapshot, setSnapshot] = useState<CheckInput | null>(null);
  const runButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => () => request.cancel(), [request]);
  useEffect(() => {
    if (!view.loading && restoreFocus.current) {
      restoreFocus.current = false;
      runButton.current?.focus();
    }
  }, [view.loading]);

  function edit(next: CheckInput, isSample = false) {
    request.cancel();
    setSnapshot(null);
    setInvalidated(Boolean(view.result || view.loading || invalidated));
    setInput(next);
    setSample(isSample);
    setRevision(value => value + 1);
    setView(invalidateResult());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResultMotion(event.currentTarget.closest('[data-input]')?.getAttribute('data-input') === 'pointer' ? 'pointer' : 'instant');
    const pending = request.begin();
    setSnapshot(null);
    setInvalidated(false);
    let body: string;
    try {
      body = prepareCheck(input);
    } catch (cause) {
      setView({ result: null, error: cause instanceof Error ? cause.message : 'Check the JSON inputs.', loading: false });
      return;
    }
    const submitted = { ...input };
    setView({ result: null, error: null, loading: true });
    try {
      const response = await fetch('/api/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        signal: pending.signal, credentials: 'omit', cache: 'no-store',
      });
      if (!response.ok) {
        const messages: Record<number, string> = {
          400: 'The checker rejected the input. Check duplicate keys, field limits, and rules.',
          413: 'Request exceeds the 128 KiB limit. Reduce the input size.',
          504: 'The checker timed out. Your input is still here; try again.',
        };
        throw new Error(messages[response.status] || 'The checker is unavailable. Confirm the Go service is running and try again.');
      }
      const result: unknown = await response.json().catch(() => null);
      if (!isCheckResponse(result)) throw new Error('The checker returned an invalid response. No report is available.');
      if (pending.isCurrent()) {
        setSnapshot(submitted);
        setView({ result, error: null, loading: false });
      }
    } catch (cause) {
      if (pending.isCurrent()) setView({ result: null, error: cause instanceof Error ? cause.message : 'Unable to reach the checker.', loading: false });
    }
  }

  function cancel() {
    request.cancel();
    setSnapshot(null);
    restoreFocus.current = true;
    setView(invalidateResult());
    setInvalidated(true);
  }

  function formatJson(field: 'source' | 'submission') {
    try {
      const value: unknown = JSON.parse(input[field]);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      edit({ ...input, [field]: JSON.stringify(value, null, 2) }, false);
    } catch { /* Keep the raw text; validation reports the problem on submit. */ }
  }

  let reviewBody: string | null = null;
  try { reviewBody = prepareCheck(input); } catch {}

  return <div className={styles.workspace} data-input="keyboard"
    onPointerDownCapture={event => { event.currentTarget.dataset.input = 'pointer'; }}
    onKeyDownCapture={event => { event.currentTarget.dataset.input = 'keyboard'; }}>
    <div className={styles.boundary}><span className={styles.eyebrow}>Standalone workspace</span><p>This does not submit work to a task. Inputs and reports are not saved in this workspace.</p></div>
    <div className={styles.workArea}>
    <section className={styles.editor} aria-labelledby="documents-title">
      <div className={styles.sectionHeading}><div><h2 id="documents-title">Source &amp; submission</h2><p>Two JSON documents. One set of rules.</p></div><span className={styles.tag}>localization-v1</span></div>
      <form onSubmit={submit}>
        <div className={styles.documents}>
          <div className={styles.document}>
            <div className={styles.documentHeading}><label htmlFor="checker-source">Source JSON</label><span>Original strings</span></div>
            <textarea id="checker-source" onBlur={() => formatJson('source')} aria-invalid={view.error?.startsWith('Source') || undefined} aria-describedby={view.error?.startsWith('Source') ? 'checker-source-error checker-json-help' : 'checker-json-help'} value={input.source} onChange={event => edit({ ...input, source: event.target.value })} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" placeholder={'{\n  "greeting": "Hello {name}"\n}'} />
            {view.error?.startsWith('Source') && <p className={styles.fieldError} id="checker-source-error">{view.error}</p>}
          </div>
          <div className={styles.document}>
            <div className={styles.documentHeading}><label htmlFor="checker-submission">Submission JSON</label><span>Text to check</span></div>
            <textarea id="checker-submission" onBlur={() => formatJson('submission')} aria-invalid={view.error?.startsWith('Submission') || undefined} aria-describedby={view.error?.startsWith('Submission') ? 'checker-submission-error checker-json-help' : 'checker-json-help'} value={input.submission} onChange={event => edit({ ...input, submission: event.target.value })} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" placeholder={'{\n  "greeting": "Halo {name}"\n}'} />
            {view.error?.startsWith('Submission') && <p className={styles.fieldError} id="checker-submission-error">{view.error}</p>}
          </div>
        </div>
        <p id="checker-json-help" className={styles.inputHelp}>Flat objects with string values. Up to 200 keys per document, 4,000 bytes per value, 128 KiB per request. Duplicate keys are rejected by the checker.</p>
        <fieldset className={styles.rules}>
          <legend>Check rules</legend>
          <label className={styles.checkbox}><input type="checkbox" checked={input.preservePlaceholders} onChange={event => edit({ ...input, preservePlaceholders: event.target.checked })} /><span><strong>Preserve placeholders</strong><small>Keep tokens such as {'{name}'} intact, including repeats.</small></span></label>
          <div className={styles.terms}><label htmlFor="checker-terms">Required terms</label><input id="checker-terms" type="text" value={input.requiredTerms} onChange={event => edit({ ...input, requiredTerms: event.target.value })} aria-describedby="checker-terms-help" placeholder="Pactra, invoice" autoComplete="off" /><p id="checker-terms-help">Comma-separated. Case-sensitive; checked only where present in source.</p></div>
        </fieldset>
        <div className={styles.actions}>
          <button ref={runButton} className={styles.primary} type="submit" disabled={view.loading}><span>{view.loading ? 'Running checks…' : 'Run checks'}</span><span aria-hidden="true">↗</span></button>
          {view.loading && <button className={styles.secondary} type="button" onClick={cancel}><span>Cancel run</span></button>}
          <button className={styles.textButton} type="button" onClick={() => edit({ ...example }, true)}><span>Load example</span></button>
          <button className={styles.textButton} type="button" onClick={() => edit({ source: '', submission: '', preservePlaceholders: true, requiredTerms: '' })}><span>Clear inputs</span></button>
          <span className={styles.actionNote}>Deterministic · No AI used</span>
        </div>
        {sample && <p className={styles.exampleNote}>Example input: the submission is missing {'{name}'}. Run the real checker to inspect it.</p>}
      </form>
    </section>

    <section className={styles.report} aria-labelledby="checker-report-title">
      <div className={styles.sectionHeading}><div><h2 id="checker-report-title">Check report</h2><p>Evidence for these exact inputs, not an approval.</p></div><span className={styles.tag}>Deterministic</span></div>
      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{view.loading ? 'Running deterministic checks.' : view.error ? 'No check report available.' : view.result ? `${view.result.passed ? 'Checks passed.' : 'Checks failed.'} Human review is still required.` : invalidated ? 'Run cancelled or inputs changed. Old report removed. Run checks again.' : 'No report yet. Run checks to inspect the inputs.'}</p>
      {view.error && <div className={styles.error} role="alert"><h3>Could not run checks</h3><p>{view.error}</p><p>Nothing was approved. Your inputs are unchanged.</p></div>}
      {view.loading && <div className={styles.empty} aria-busy="true"><span className={styles.emptyMark} aria-hidden="true">···</span><h3>Checking your strings</h3><p>Waiting for the checker. Edit an input or cancel the run to stop.</p><div className={styles.skeleton} aria-hidden="true"><span /><span /><span /></div></div>}
      {!view.loading && !view.error && !view.result && <div className={styles.empty}><span className={styles.emptyMark} aria-hidden="true">≡</span><h3>{invalidated ? 'Fresh inputs need a fresh check' : 'Your evidence starts here'}</h3><p>{invalidated ? 'The previous run was cancelled or its inputs changed. Run checks again for the current inputs.' : 'Run checks to compare keys, nonblank text, placeholders, and required terms. Expand a key to see its exact source and submission.'}</p></div>}
      {view.result && snapshot && <EvidenceReport key={revision} result={view.result} input={snapshot} motion={resultMotion} />}
    </section>
    </div>
    <SemanticReview key={revision} body={reviewBody} />
    <p className={styles.footerNote}>Checks can catch structural errors. They cannot confirm meaning, buyer acceptance, or payment authorization.</p>
  </div>;
}

function EvidenceReport({ result, input, motion }: { result: CheckResponse; input: CheckInput; motion: 'pointer' | 'instant' }) {
  const [failuresOnly, setFailuresOnly] = useState(false);
  const evidence = buildEvidence(input, result);
  const failedChecks = result.checks.filter(check => check.status === 'fail').length;
  const failedKeys = evidence.filter(row => row.checks.some(check => check.status === 'fail')).length;
  const rows = failuresOnly ? evidence.filter(row => row.checks.some(check => check.status === 'fail')) : evidence;
  return <div className={styles.result} data-motion={motion} onAnimationEnd={event => { if (event.target === event.currentTarget) event.currentTarget.dataset.motion = 'instant'; }}>
    <div className={styles.verdict}>
      <div><span className={result.passed ? styles.pass : styles.fail}>{result.passed ? '✓ Checks passed' : '! Checks failed'}</span><p>{result.passed ? 'Every implemented check passed. Human review is still required.' : `${failedChecks} of ${result.checks.length} checks failed. Inspect the evidence before revising.`}</p></div>
      <div className={styles.reportCount}><strong>{evidence.length}</strong><span>{evidence.length === 1 ? 'key checked' : 'keys checked'}</span></div>
    </div>
    <div className={styles.evidenceToolbar}><div className={styles.filters} role="group" aria-label="Filter evidence"><button type="button" aria-pressed={!failuresOnly} onClick={() => setFailuresOnly(false)}>All keys <span>{evidence.length}</span></button><button type="button" aria-pressed={failuresOnly} onClick={() => setFailuresOnly(true)}>Needs attention <span>{failedKeys}</span></button></div><span>Exact strings · JSON-encoded</span></div>
    {rows.length === 0 && <p className={styles.noFindings}>No keys need attention under these rules. This does not assess translation quality.</p>}
    <div className={styles.evidenceList}>{rows.map(row => {
      const failures = row.checks.filter(check => check.status === 'fail').length;
      return <details className={styles.evidenceRow} key={row.key} onAnimationEnd={event => { event.currentTarget.dataset.motion = 'instant'; }}>
        <summary onClick={event => { if (event.currentTarget.parentElement) event.currentTarget.parentElement.dataset.motion = event.detail === 0 ? 'instant' : 'pointer'; }}><span className={styles.disclosureIcon} aria-hidden="true" /><code>{JSON.stringify(row.key)}</code><span className={failures ? styles.fail : row.checks.length ? styles.pass : styles.advisory}>{failures ? `${failures} failed` : row.checks.length ? 'Passed' : 'Not checked'}</span><span className={styles.evidenceHint}>View evidence</span></summary>
        <div className={styles.evidenceContent}>
          <div className={styles.exactPair}><ExactString label="Source" value={row.source} /><ExactString label="Submission" value={row.submission} /></div>
          <ul className={styles.findings}>{row.checks.map((check, index) => <li key={`${check.id}-${index}`}><span className={check.status === 'pass' ? styles.pass : styles.fail}>{check.status === 'pass' ? 'Pass' : 'Fail'}</span><div><strong>{labels.get(check.id) ?? check.id}</strong><p>{check.message}</p></div></li>)}</ul>
        </div>
      </details>;
    })}</div>
    <p className={styles.reportFootnote}>{result.checker_version} · Rules apply only to this run. Editing any input removes this report and any AI review.</p>
  </div>;
}

function ExactString({ label, value }: { label: string; value: string | undefined }) {
  return <div className={styles.exactString}><h4>{label}</h4>{value === undefined ? <p className={styles.missing}>Key not present</p> : <pre>{JSON.stringify(value)}</pre>}</div>;
}
