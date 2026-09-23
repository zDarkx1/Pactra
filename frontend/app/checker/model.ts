import { buildRawRequest } from '../../lib/check-input.ts';
import type { Check, CheckInput, CheckResponse } from '../../lib/types.ts';

export type Evidence = { key: string; source: string | undefined; submission: string | undefined; checks: Check[] };
export type ReviewFinding = {
  key: string;
  assessment: 'supported' | 'concern' | 'uncertain';
  source_excerpt: string;
  submission_excerpt: string;
  explanation: string;
};
export type ReviewResponse = { status: 'completed'; advisory: true; findings: ReviewFinding[] };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export function prepareCheck(input: CheckInput): string {
  const body = buildRawRequest(input);
  if (new TextEncoder().encode(body).length > 128 * 1024) throw new Error('Request exceeds the 128 KiB limit. Reduce the input size.');
  return body;
}

export function buildEvidence(input: CheckInput, result: CheckResponse): Evidence[] {
  const source = JSON.parse(input.source) as Record<string, string>;
  const submission = JSON.parse(input.submission) as Record<string, string>;
  const checks = new Map<string, Check[]>();
  for (const check of result.checks) {
    const group = checks.get(check.key) ?? [];
    group.push(check);
    checks.set(check.key, group);
  }
  return [...new Set([...Object.keys(source), ...Object.keys(submission), ...checks.keys()])].sort().map(key => ({
    key,
    source: owns(source, key) ? source[key] : undefined,
    submission: owns(submission, key) ? submission[key] : undefined,
    checks: checks.get(key) ?? [],
  }));
}

export function reviewInputError(body: string | null): string | null {
  if (!body) return 'Enter valid source and submission JSON to enable AI review.';
  if (new TextEncoder().encode(body).length > 16 * 1024) return 'AI review accepts up to 16 KiB. Reduce the input size.';
  try {
    const input: unknown = JSON.parse(body);
    if (!record(input) || !record(input.source) || !record(input.submission)) return 'Enter valid source and submission JSON to enable AI review.';
    if (![input.source, input.submission].every(document => Object.values(document).every(value => typeof value === 'string'))) return 'AI review requires string values only.';
    const sourceKeys = Object.keys(input.source);
    const submissionKeys = Object.keys(input.submission);
    if (sourceKeys.length > 20 || submissionKeys.length > 20) return 'AI review accepts up to 20 keys in each document.';
    if (!sourceKeys.some(key => owns(input.submission as object, key))) return 'AI review needs at least one shared key.';
    return null;
  } catch {
    return 'Enter valid source and submission JSON to enable AI review.';
  }
}

export function isReviewResponse(value: unknown, body: string): value is ReviewResponse {
  if (reviewInputError(body) || !record(value) || value.status !== 'completed' || value.advisory !== true || !Array.isArray(value.findings)) return false;
  const input = JSON.parse(body) as { source: Record<string, string>; submission: Record<string, string> };
  const expected = new Set(Object.keys(input.source).filter(key => owns(input.submission, key)));
  if (value.findings.length !== expected.size) return false;
  const encoder = new TextEncoder();
  return value.findings.every(finding => {
    if (!record(finding) || typeof finding.key !== 'string' || !expected.delete(finding.key)) return false;
    return typeof finding.assessment === 'string'
      && ['supported', 'concern', 'uncertain'].includes(finding.assessment)
      && finding.source_excerpt === input.source[finding.key]
      && finding.submission_excerpt === input.submission[finding.key]
      && typeof finding.explanation === 'string'
      && finding.explanation.trim().length > 0
      && encoder.encode(finding.explanation).length <= 2000;
  });
}

export function createRequestGuard() {
  let active: AbortController | null = null;
  let generation = 0;
  function cancel() {
    generation += 1;
    active?.abort();
    active = null;
  }
  return {
    cancel,
    begin() {
      cancel();
      const current = generation;
      const controller = new AbortController();
      active = controller;
      return { signal: controller.signal, isCurrent: () => generation === current && !controller.signal.aborted };
    },
  };
}
