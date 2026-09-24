import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidence, createRequestGuard, isReviewResponse, prepareCheck, reviewInputError } from '../app/checker/model.ts';
import { isCheckResponse } from '../lib/check-response.ts';
import type { CheckInput, CheckResponse } from '../lib/types.ts';

const input: CheckInput = {
  source: '{"greeting":" Hello {name}\\n","blank":""}',
  submission: '{"greeting":" Halo {name}\\n","blank":" "}',
  preservePlaceholders: true,
  requiredTerms: '',
};
const report: CheckResponse = {
  checker_version: 'localization-v1', passed: false,
  checks: [
    { id: 'key_parity', key: 'greeting', status: 'pass', message: 'Key exists in source and submission.' },
    { id: 'nonempty', key: 'blank', status: 'fail', message: 'Submission is empty or whitespace.' },
  ],
  ai_review: { status: 'not_configured', message: 'Semantic review is not implemented. Human review required.' },
};
const body = prepareCheck(input);
const review = {
  status: 'completed', advisory: true,
  findings: [
    { key: 'greeting', assessment: 'supported', source_excerpt: ' Hello {name}\n', submission_excerpt: ' Halo {name}\n', explanation: 'Meaning is preserved.' },
    { key: 'blank', assessment: 'uncertain', source_excerpt: '', submission_excerpt: ' ', explanation: 'Blank values need context.' },
  ],
};

test('checker preserves raw duplicate and escaped duplicate keys on the wire', () => {
  const source = '{"same":"first", "sa\\u006de":"last"}';
  const submission = '{"same":"one","same":"two"}';
  const result = prepareCheck({ ...input, source, submission, requiredTerms: 'invoice, Pactra' });
  assert.ok(result.includes(`"source":${source}`));
  assert.ok(result.includes(`"submission":${submission}`));
  assert.deepEqual(JSON.parse(result).rules.required_terms, ['invoice', 'Pactra']);
});

test('checker applies UTF-8 byte limits rather than JavaScript character counts', () => {
  const oversized = { ...input, source: JSON.stringify({ large: '界'.repeat(45000) }) };
  assert.throws(() => prepareCheck(oversized), /128 KiB/);
  assert.doesNotThrow(() => prepareCheck({ ...input, source: JSON.stringify({ large: 'x'.repeat(45000) }) }));
});

test('invalid JSON and non-string values never produce a request body', () => {
  for (const source of ['', 'null', '[]', '{broken}', '{"value":2}', '{"nested":{"value":"x"}}']) {
    assert.throws(() => prepareCheck({ ...input, source }));
  }
});

test('evidence retains all whitespace and separates missing keys from empty strings', () => {
  const evidence = buildEvidence({ ...input, source: '{"blank":"","greeting":" Hello {name}\\n","missing":"text"}', submission: '{"blank":" ","greeting":" Halo {name}\\n","extra":""}' }, report);
  assert.deepEqual(evidence.map(row => row.key), ['blank', 'extra', 'greeting', 'missing']);
  assert.equal(evidence[0].source, '');
  assert.equal(evidence[0].submission, ' ');
  assert.equal(evidence[1].source, undefined);
  assert.equal(evidence[1].submission, '');
  assert.equal(evidence[2].source, ' Hello {name}\n');
  assert.equal(evidence[2].submission, ' Halo {name}\n');
  assert.equal(evidence[3].submission, undefined);
});

test('evidence treats prototype-like keys as plain data and retains markup as text', () => {
  const unusual = { ...input, source: '{"__proto__":"<script>bad()</script>","constructor":"original","toString":"x"}', submission: '{"__proto__":"<img onerror=bad()>","constructor":"copy"}' };
  const evidence = buildEvidence(unusual, { ...report, checks: [] });
  assert.deepEqual(evidence.map(row => row.key), ['__proto__', 'constructor', 'toString']);
  assert.equal(evidence[0].source, '<script>bad()</script>');
  assert.equal(evidence[0].submission, '<img onerror=bad()>');
  assert.equal(evidence[2].submission, undefined);
});

test('evidence groups multiple checks per key without replacing repeated required-term checks', () => {
  const checks = [{ ...report.checks[0], id: 'required_term', message: 'First term' }, { ...report.checks[0], id: 'required_term', message: 'Second term' }];
  const evidence = buildEvidence(input, { ...report, checks });
  assert.deepEqual(evidence.find(row => row.key === 'greeting')?.checks, checks);
});

test('HTTP 200 with failed checks remains a valid report, not a network error', () => {
  assert.equal(isCheckResponse(report), true);
  assert.equal(isCheckResponse({ ...report, passed: true }), false);
  assert.equal(isCheckResponse({ ...report, checks: [] }), false);
});

test('request cancellation makes late responses ineligible immediately', () => {
  const guard = createRequestGuard();
  const pending = guard.begin();
  assert.equal(pending.isCurrent(), true);
  guard.cancel();
  assert.equal(pending.signal.aborted, true);
  assert.equal(pending.isCurrent(), false);
});

test('a newer request supersedes older responses even if their transport ignores abort', async () => {
  const guard = createRequestGuard();
  const old = guard.begin();
  const current = guard.begin();
  const displayed: string[] = [];
  await Promise.resolve().then(() => { if (current.isCurrent()) displayed.push('new report'); });
  await Promise.resolve().then(() => { if (old.isCurrent()) displayed.push('stale report'); });
  assert.deepEqual(displayed, ['new report']);
  assert.equal(old.signal.aborted, true);
  assert.equal(current.isCurrent(), true);
});

test('repeated cancellation and rerunning identical input cannot revive an old request', () => {
  const guard = createRequestGuard();
  const first = guard.begin();
  guard.cancel();
  guard.cancel();
  const second = guard.begin();
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  guard.cancel();
  assert.equal(second.isCurrent(), false);
});

test('AI rejects invalid input, disjoint documents, and more than 20 keys', () => {
  for (const value of [null, '', 'null', '{}', 'invalid', '{"source":[],"submission":{}}', '{"source":{"a":2},"submission":{"a":"x"}}']) assert.ok(reviewInputError(value));
  assert.match(reviewInputError(prepareCheck({ ...input, source: '{"a":"x"}', submission: '{"b":"y"}' })) ?? '', /shared key/);
  const many = JSON.stringify(Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`key-${index}`, 'text'])));
  assert.match(reviewInputError(prepareCheck({ ...input, source: many, submission: many })) ?? '', /20 keys/);
  assert.equal(reviewInputError(body), null);
});

test('AI input size is bounded in UTF-8 bytes and never silently truncated', () => {
  const large = prepareCheck({ ...input, source: JSON.stringify({ greeting: '界'.repeat(6000) }) });
  assert.match(reviewInputError(large) ?? '', /16 KiB/);
});

test('AI validates full exact excerpts, including blank strings and whitespace', () => {
  assert.equal(isReviewResponse(review, body), true);
  for (const changes of [{ source_excerpt: 'Hello {name}\n' }, { submission_excerpt: 'Halo' }, { explanation: '' }, { explanation: '   ' }, { explanation: '界'.repeat(667) }, { assessment: 'approved' }, { assessment: ['supported'] }]) {
    assert.equal(isReviewResponse({ ...review, findings: [{ ...review.findings[0], ...changes }, review.findings[1]] }, body), false);
  }
});

test('AI rejects missing, duplicate, unknown and fabricated findings', () => {
  for (const findings of [[], [review.findings[0]], [review.findings[0], review.findings[0]], [{ ...review.findings[0], key: 'invented' }, review.findings[1]], [null, review.findings[1]]]) {
    assert.equal(isReviewResponse({ ...review, findings }, body), false);
  }
});

test('AI never accepts approval-shaped or malformed responses', () => {
  for (const value of [null, true, [], {}, { ...review, status: 'approved' }, { ...review, advisory: false }, { ...review, findings: {} }]) assert.equal(isReviewResponse(value, body), false);
  assert.equal(isReviewResponse(review, 'invalid'), false);
});

test('AI coverage includes only the full intersection, with prototype-like keys handled safely', () => {
  const unusual = prepareCheck({ ...input, source: '{"__proto__":"original","missing":"x"}', submission: '{"__proto__":"translation","extra":"y"}' });
  assert.equal(isReviewResponse({ status: 'completed', advisory: true, findings: [{ key: '__proto__', assessment: 'uncertain', source_excerpt: 'original', submission_excerpt: 'translation', explanation: 'Context needed.' }] }, unusual), true);
});
