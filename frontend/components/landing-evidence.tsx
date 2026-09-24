'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createRequestGuard, prepareCheck } from '../app/checker/model';
import { isCheckResponse } from '../lib/check-response';
import type { CheckInput, ViewState } from '../lib/types';
import { Icon } from './ui';
import styles from './landing-evidence-styles';

export default function LandingEvidence() {
  const [restored, setRestored] = useState(false);
  const [edited, setEdited] = useState(false);
  const [view, setView] = useState<ViewState>({ result: null, error: null, loading: false });
  const [motion, setMotion] = useState<'pointer' | 'instant'>('instant');
  const [requests] = useState(createRequestGuard);
  useEffect(() => () => requests.cancel(), [requests]);

  function changeSample() {
    requests.cancel();
    setRestored(value => !value);
    setEdited(true);
    setView({ result: null, error: null, loading: false });
  }
  async function check(pointer: boolean) {
    if (view.loading) return;
    const pending = requests.begin();
    setMotion(pointer ? 'pointer' : 'instant');
    setView({ result: null, error: null, loading: true });
    const input: CheckInput = {
      source: JSON.stringify({ greeting: 'Hello, {name}.' }),
      submission: JSON.stringify({ greeting: restored ? 'Halo, {name}.' : 'Halo.' }),
      preservePlaceholders: true, requiredTerms: '',
    };
    try {
      const response = await fetch('/api/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: prepareCheck(input), signal: pending.signal, credentials: 'omit', cache: 'no-store',
      });
      if (!response.ok) throw new Error(response.status === 504 ? 'The checker timed out. Try the sample again.' : 'The checker is unavailable. The sample is still here; try again when the Go service is running.');
      const result: unknown = await response.json();
      if (!isCheckResponse(result)) throw new Error('The checker returned an invalid response. No result is shown.');
      if (pending.isCurrent()) setView({ result, error: null, loading: false });
    } catch (cause) {
      if (pending.isCurrent()) setView({ result: null, error: cause instanceof Error ? cause.message : 'The check could not finish.', loading: false });
    }
  }
  const failures = view.result?.checks.filter(item => item.status === 'fail') ?? [];
  return <div className={styles.sample}>
    <div className={styles.sampleHeader}><span>Synthetic sample</span><code>greeting</code></div>
    <div className={styles.comparison}>
      <div className={styles.sampleValue}><h3>Source <span>English</span></h3><p><code>Hello, <mark>{'{name}'}</mark>.</code></p></div>
      <div className={styles.sampleValue}><h3>Submission <span>Indonesian</span></h3><p><code>{restored ? <>Halo, <mark>{'{name}'}</mark>.</> : 'Halo.'}</code></p></div>
    </div>
    <div className={styles.sampleControls}>
      <button type="button" className={styles.runButton} onClick={event => void check(event.detail !== 0)} disabled={view.loading} aria-busy={view.loading || undefined}><span>{view.loading ? 'Checking…' : 'Run this check'}</span><Icon name="arrow-right" /></button>
      <button type="button" className={styles.restoreButton} aria-pressed={restored} onClick={changeSample}>{restored ? 'Use the original submission' : 'Restore the missing placeholder'}</button>
    </div>
    <div className={styles.sampleFeedback} data-motion={motion} data-outcome={view.result ? view.result.passed ? 'pass' : 'fail' : undefined}>
      {view.error ? <p role="alert" className={styles.sampleError}>{view.error}</p> : <div role="status" aria-live="polite" aria-atomic="true">
        {view.loading ? <p>Comparing this sample with its source…</p> : view.result ? <div className={styles.liveResult}>
          <strong>{view.result.passed ? 'Checks passed' : 'The check found a difference'}</strong>
          <p>{view.result.passed ? 'This version preserves the source key, placeholder, and non-empty value. Translation quality still needs human review.' : failures.map(item => item.message).join(' ')}</p>
          <span className={styles.responseVersion}>Go response · {view.result.checker_version}</span>
        </div> : <p>{edited ? 'The sample changed. Run the check to get a new result.' : 'Run the sample to see the actual checker response.'}</p>}
      </div>}
    </div>
    <Link className={styles.sampleLink} href="/checker">Open the full checker <Icon name="arrow-up-right" /></Link>
  </div>;
}
