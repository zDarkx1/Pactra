'use client';

import SemanticReview from './semantic-review';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { buildRawRequest, invalidateResult } from '../lib/check-input';
import { isCheckResponse } from '../lib/check-response';
import type { CheckInput, ViewState } from '../lib/types';

const defaults: CheckInput = { source: '{"greeting":"Hello {name}","brand":"ProofPay"}', submission: '{"greeting":"Halo","brand":"ProofPay"}', preservePlaceholders: true, requiredTerms: 'ProofPay' };
const labels: Record<string, string> = { key_parity: 'Key parity', nonempty: 'Non-empty translation', placeholders: 'Placeholder preservation', required_term: 'Required term' };

export default function Workbench() {
  const [input, setInput] = useState<CheckInput>({ ...defaults });
  const [view, setView] = useState<ViewState>(invalidateResult);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);

  function edit(next: CheckInput) {
    generation.current += 1;
    controller.current?.abort();
    setInput(next);
    setView(invalidateResult());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    controller.current?.abort();
    const current = ++generation.current;
    let body: string;
    try {
      body = buildRawRequest(input);
      if (new TextEncoder().encode(body).length > 128 * 1024) throw new Error('Request exceeds the 128 KiB limit.');
    } catch (cause) {
      setView({ result: null, error: cause instanceof Error ? cause.message : 'Check the JSON inputs.', loading: false });
      return;
    }
    const pending = new AbortController();
    controller.current = pending;
    setView({ result: null, error: null, loading: true });
    try {
      const response = await fetch('/api/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: pending.signal, credentials: 'omit' });
      const result: unknown = await response.json();
      if (!response.ok) {
        const messages: Record<number, string> = { 400: 'The checker rejected the input. Check duplicate keys, field limits, and rules.', 413: 'Request exceeds the 128 KiB limit.', 504: 'The checker timed out. Please try again.' };
        throw new Error(messages[response.status] || 'The local checker is unavailable. Confirm the Go service is running and try again.');
      }
      if (!isCheckResponse(result)) throw new Error('The checker returned an invalid response. Please try again.');
      if (generation.current === current) setView({ result, error: null, loading: false });
    } catch (cause) {
      if (generation.current === current && !pending.signal.aborted) setView({ result: null, error: cause instanceof Error ? cause.message : 'Unable to reach the checker.', loading: false });
    }
  }
  let reviewBody: string | null = null;
  try { reviewBody = buildRawRequest(input); } catch { /* Invalid inputs cannot start AI review. */ }
  return <div className="shell">
    <a className="skip" href="#workbench">Skip to workbench</a>
    <aside className="sidebar" aria-label="Workspace overview">
      <a href="/" className="brand"><span className="brand-mark" aria-hidden="true">P<span>✓</span></span>ProofPay</a>
      <div className="workspace-label">LOCAL WORKSPACE <span className="dot" /></div>
      <div className="active-nav"><span aria-hidden="true">▦</span> Localization checker <span className="nav-index">01</span></div>
      <div className="roadmap"><p className="eyebrow">PLANNED MILESTONES</p>
        {['Wallet connection', 'Escrow & settlement', 'Submission storage'].map((name, index) => <div className="milestone" key={name}><span className="milestone-number">0{index + 2}</span><div>{name}<small>NOT IMPLEMENTED</small></div></div>)}
      </div>
      <div className="sidebar-note"><span className="small-mark" aria-hidden="true">◇</span><strong>Evidence before action.</strong><p>Deterministic checks are a starting point. Human review stays essential.</p><span className="version">STARTER / LOCALIZATION V1</span></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><span>Workspace <span className="slash">/</span> <strong>Localization</strong></span><span className="local-badge"><span className="dot" /> Local starter</span></header>
      <main id="workbench">
        <div className="scope-banner"><span aria-hidden="true">ⓘ</span> Local starter • optional Azure AI review • no wallet, escrow or storage connected</div>
        <div className="page-heading"><div><p className="eyebrow">SUBMISSION WORKBENCH</p><h1>Make every string count.</h1><p className="subtitle">Compare a translation against its source. See exactly what needs attention.</p></div><span className="engine-tag">DETERMINISTIC<br /><strong>localization-v1</strong></span></div>
        <div className="work-grid">
          <section className="editor-panel" aria-labelledby="input-title">
            <div className="panel-heading"><div><span className="step">01</span><h2 id="input-title">Prepare your submission</h2></div><span className="muted-caption">JSON → JSON</span></div>
            <form onSubmit={submit} aria-busy={view.loading}>
              <div className="document-grid">
                <div className="field"><div className="field-heading"><label htmlFor="source">Source</label><span>REFERENCE</span></div><textarea id="source" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={input.source} onChange={event => edit({ ...input, source: event.target.value })} aria-describedby="json-help" /></div>
                <div className="field"><div className="field-heading"><label htmlFor="submission">Submission</label><span>TRANSLATION</span></div><textarea id="submission" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={input.submission} onChange={event => edit({ ...input, submission: event.target.value })} aria-describedby="json-help sample-help" /></div>
              </div>
              <p className="field-help" id="json-help">Use JSON objects with string values only. Duplicate keys are checked by the server.</p>
              <div className="rules"><div className="rules-heading"><h3>Check rules</h3><span>APPLIED TO THIS RUN</span></div>
                <label className="checkbox-row"><input type="checkbox" checked={input.preservePlaceholders} onChange={event => edit({ ...input, preservePlaceholders: event.target.checked })} /><span><strong>Preserve placeholders</strong><small>Keep tokens such as {'{name}'} intact in each translation.</small></span></label>
                <label className="terms-label" htmlFor="terms">Required terms <span>Optional · comma or newline separated</span></label>
                <textarea className="terms" id="terms" rows={2} value={input.requiredTerms} onChange={event => edit({ ...input, requiredTerms: event.target.value })} aria-describedby="terms-help" />
                <p className="field-help" id="terms-help">Case-sensitive terms must remain in the corresponding source key’s translation.</p>
              </div>
              <div className="sample-note" id="sample-help"><span aria-hidden="true">↳</span> The starter sample is missing {'{name}'}. Run it to inspect the failure.</div>
              <div className="actions"><button className="primary" type="submit" disabled={view.loading}>{view.loading ? 'Running checks…' : 'Run checks'}<span aria-hidden="true">↗</span></button><button className="secondary" type="button" onClick={() => edit({ ...defaults, submission: '{"greeting":"Halo {name}","brand":"ProofPay"}' })}>Fix sample</button><button className="reset" type="button" onClick={() => edit({ ...defaults })}>Reset</button></div>
            </form>
          </section>
          <section className="results-panel" aria-labelledby="results-title" aria-busy={view.loading}>
            <div className="panel-heading"><div><span className="step">02</span><h2 id="results-title">Check report</h2></div><span className="report-dot" /></div>
            <div role="status" aria-live="polite" className="sr-only">{view.loading ? 'Running deterministic checks.' : view.result ? view.result.passed ? 'Checks passed. Human review required.' : 'Checks failed. Review the criteria below.' : 'Inputs ready. Run checks to generate a report.'}</div>
            {view.error && <div className="error" role="alert"><strong>Could not run checks</strong><p>{view.error}</p></div>}
            {!view.result && !view.error && <div className="empty-state"><div className={`report-icon ${view.loading ? 'loading' : ''}`} aria-hidden="true">{view.loading ? '⋯' : '≡'}</div><h3>{view.loading ? 'Inspecting your submission' : 'Your evidence starts here'}</h3><p>{view.loading ? 'Waiting for the local checker. You can edit inputs to cancel this run.' : 'Run checks to see a pass or fail for each criterion, with a reason you can inspect.'}</p><span className="empty-tag">NO REPORT YET</span></div>}
            {view.result && <div className="report-content"><div className={`result-summary ${view.result.passed ? 'passed' : 'failed'}`}><span aria-hidden="true">{view.result.passed ? '✓' : '!'}</span><div><h3>{view.result.passed ? 'Checks passed' : 'Checks failed'}</h3><p>{view.result.checks.filter(check => check.status === 'pass').length} of {view.result.checks.length} criteria passed</p></div></div><ol className="check-list">{view.result.checks.map((check, index) => <li key={`${check.id}:${check.key}:${index}`}><div className="check-top"><strong>{labels[check.id] || check.id}</strong><span className={`status-pill ${check.status}`}>{check.status === 'pass' ? 'Pass' : 'Fail'}</span></div><code>{check.key || 'Document'}</code><p>{check.message}</p></li>)}</ol><div className="ai-note"><strong>Human review required</strong><p>{view.result.ai_review.message}</p></div></div>}
            <div className="report-footer"><span aria-hidden="true">◇</span> Check evidence only. Not a financial authorization.</div>
          </section>
        </div>
        <SemanticReview key={JSON.stringify(input)} body={reviewBody} />
        <section className="scope-details" aria-label="Checker scope"><div><span>01 / STRUCTURE</span><h3>Matching keys</h3><p>Find missing or extra keys and empty translations.</p></div><div><span>02 / CONSTRAINTS</span><h3>Preserved intent markers</h3><p>Check placeholder tokens and exact required terms.</p></div><div><span>03 / HUMAN JUDGMENT</span><h3>Meaning still needs you</h3><p>Deterministic checks do not assess meaning. Request the separate advisory AI review when needed.</p></div></section>
        <footer className="page-footer"><span>ProofPay <span className="footer-separator">/</span> Local checker starter</span><span>No persistence. Results clear when inputs change.</span></footer>
      </main>
    </div>
  </div>;
}
