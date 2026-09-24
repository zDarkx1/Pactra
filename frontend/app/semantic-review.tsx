'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { createRequestGuard, isReviewResponse, reviewInputError } from './checker/model';
import type { ReviewResponse } from './checker/model';
import styles from './checker/checker-styles';

export default function SemanticReview({ body }: { body: string | null }) {
  if (process.env.NODE_ENV === 'production') return <section className={styles.aiPanel} aria-labelledby="ai-review-title"><div className={styles.sectionHeading}><div><h2 id="ai-review-title">AI meaning review</h2><p>Optional, advisory, and separate from deterministic checks.</p></div><span className={styles.tag}>Disabled</span></div><p className={styles.aiBoundary}>AI review is disabled in production. It stays local-only until authenticated access and durable per-user spend limits are in place. Deterministic checks remain available.</p></section>;
  return <ReviewSession key={body} body={body} />;
}

function ReviewSession({ body }: { body: string | null }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [motion, setMotion] = useState<'pointer' | 'instant'>('instant');
  const [request] = useState(createRequestGuard);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const inputError = reviewInputError(body);
  useEffect(() => () => request.cancel(), [request]);
  useEffect(() => {
    if (!busy && restoreFocus.current) {
      restoreFocus.current = false;
      reviewButton.current?.focus();
    }
  }, [busy]);

  function clearReview() {
    request.cancel();
    setBusy(false);
    setError('');
    setResult(null);
  }

  async function run(event: MouseEvent<HTMLButtonElement>) {
    if (!body || inputError || !consent || busy || process.env.NODE_ENV === 'production') return;
    setMotion(event.detail === 0 ? 'instant' : 'pointer');
    const pending = request.begin();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        signal: pending.signal, credentials: 'omit', cache: 'no-store',
      });
      if (!response.ok) {
        const messages: Record<number, string> = {
          400: 'The review input was rejected. Check duplicate keys and field limits.',
          413: 'AI review accepts up to 20 keys and 16 KiB.',
          429: 'AI review is busy. Wait before trying again.',
          503: 'AI review is not configured. Deterministic checks still work.',
          504: 'AI review timed out. No assessment is available.',
        };
        throw new Error(messages[response.status] || 'AI review is unavailable. Deterministic checks still work.');
      }
      const result: unknown = await response.json().catch(() => null);
      if (!isReviewResponse(result, body)) throw new Error('AI returned an invalid review. No assessment is available.');
      if (pending.isCurrent()) setResult(result);
    } catch (cause) {
      if (pending.isCurrent()) setError(cause instanceof Error ? cause.message : 'AI review is unavailable.');
    } finally {
      if (pending.isCurrent()) setBusy(false);
    }
  }

  return <section className={styles.aiPanel} aria-labelledby="ai-review-title">
    <div className={styles.sectionHeading}><div><h2 id="ai-review-title">AI meaning review</h2><p>Azure Foundry · Optional advisory analysis</p></div><span className={styles.tag}>Local only</span></div>
    <div className={styles.aiBody}>
      <p className={styles.aiBoundary}>AI assesses meaning, not acceptance or payment. Its findings never change the deterministic report. Up to 20 keys per document and 16 KiB.</p>
      <label className={styles.checkbox}><input type="checkbox" checked={consent} disabled={Boolean(inputError)} onChange={event => { clearReview(); setConsent(event.target.checked); }} /><span>Send these source and submission texts to the configured Azure AI provider.<small>Do not include private or sensitive content. Editing inputs clears consent and review.</small></span></label>
      {inputError && <p className={styles.inputHelp} id="ai-disabled-reason">{inputError}</p>}
      {!inputError && !consent && <p className={styles.inputHelp} id="ai-disabled-reason">Your explicit consent is required before any text is sent to AI.</p>}
      <div className={styles.actions}><button ref={reviewButton} className={`${styles.secondary} ${styles.reviewButton}`} type="button" disabled={Boolean(inputError) || !consent || busy} aria-describedby={inputError || !consent ? 'ai-disabled-reason' : undefined} onClick={run}><span>{busy ? 'Reviewing meaning…' : 'Review meaning with AI'}</span></button>{busy && <button className={styles.textButton} type="button" onClick={() => { restoreFocus.current = true; clearReview(); }}><span>Cancel review</span></button>}</div>
      <p role="status" aria-live="polite" aria-atomic="true" className={busy ? styles.inputHelp : styles.srOnly}>{busy ? 'Waiting for AI. Deterministic results remain separate.' : result ? `AI review complete: ${result.findings.length} advisory findings. Human review required.` : 'No AI assessment available.'}</p>
      {error && <div role="alert" className={styles.error}><strong>No AI assessment available</strong><p>{error}</p></div>}
      {result && <div className={styles.result} data-motion={motion} onAnimationEnd={event => { if (event.target === event.currentTarget) event.currentTarget.dataset.motion = 'instant'; }}><p className={styles.aiResultHeading}>Advisory findings · Human review required</p><ul className={styles.aiFindings}>{result.findings.map(finding => <li key={finding.key}><div className={styles.aiFindingHeading}><code>{JSON.stringify(finding.key)}</code><span className={finding.assessment === 'concern' ? styles.fail : styles.advisory}>{finding.assessment === 'supported' ? 'Meaning supported' : finding.assessment === 'concern' ? 'Concern' : 'Uncertain'}</span></div><p>{finding.explanation}</p><div className={styles.exactPair}><div className={styles.exactString}><h4>Source</h4><pre>{JSON.stringify(finding.source_excerpt)}</pre></div><div className={styles.exactString}><h4>Submission</h4><pre>{JSON.stringify(finding.submission_excerpt)}</pre></div></div></li>)}</ul></div>}
    </div>
  </section>;
}
