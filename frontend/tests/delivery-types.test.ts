import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseDeliveryHistory, parseDeliveryMutation, buildDeliveryIntent } from '../lib/delivery-types.ts';

// Contract fixtures from delivery.go and handler.go, not recorded user artifacts.
const hash = 'a'.repeat(64), artifactHash = 'b'.repeat(64);
const actor = '0x' + '1'.repeat(40);
const id = '11111111-1111-4111-8111-111111111111';
function empty() {
  return { task_id: id, deliverable_id: 'translation', task_status: 'accepted_unfunded', unfunded_review: true,
    manifest_hash: hash, state: 'not_submitted', latest_version: 0, latest_artifact_hash: '', revision_limit: 2,
    submissions: [] as unknown[], reviews: [] as unknown[], disputes: [] as unknown[] };
}
function submitted() {
  return { ...empty(), state: 'submitted', latest_version: 1, latest_artifact_hash: artifactHash, submissions: [{
    version: 1, actor, artifact: { greeting: 'Bonjour' }, artifact_hash: artifactHash, manifest_hash: hash,
    notes: '', created_at: '2026-09-24T12:00:00.123456Z', checker: {
      policy: 'default_metadata_only', rules: { preserve_placeholders: false, required_terms: [] }, http_status: 200,
      output: { checker_version: 'localization-v1', passed: true, checks: [
        { id: 'key_parity', key: 'greeting', status: 'pass', message: 'Key exists in source and submission.' },
        { id: 'nonempty', key: 'greeting', status: 'pass', message: 'Submission is nonblank.' },
      ], ai_review: { status: 'not_configured', message: 'Semantic review is not implemented. Human review required.' } },
    },
  }] };
}
function event() { return { version: 1, actor, artifact_hash: artifactHash, manifest_hash: hash, notes: '', created_at: '2026-09-24T12:01:00Z' }; }

test('both exported parsers accept actual snapshot shape and copy private objects', () => {
  assert.deepEqual(parseDeliveryHistory(empty()), empty());
  const input = submitted(), result = parseDeliveryMutation(input);
  assert.deepEqual(result, input);
  input.submissions[0].artifact.greeting = 'changed';
  assert.equal(result.submissions[0].artifact.greeting, 'Bonjour');
});
// Go strings.TrimSpace uses Unicode White_Space, not ECMAScript trim().
const goWhitespace = '\u0009\u000a\u000b\u000c\u000d\u0020\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000';
function withArtifact(artifact: Record<string, string>) {
  const input = submitted();
  return { ...input, submissions: [{ ...input.submissions[0], artifact }] };
}
function assertKeyRejected(key: string) {
  const artifact = { [key]: 'legitimate string' };
  for (const parse of [parseDeliveryHistory, parseDeliveryMutation]) {
    assert.throws(() => parse(withArtifact(artifact)), JSON.stringify(key));
  }
  assert.throws(() => buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', JSON.stringify(artifact), true, id), JSON.stringify(key));
}
test('both response parsers preserve Go-nonblank Unicode keys including U+FEFF', () => {
  for (const key of ['\ufeff', '\u0085\ufeff\u3000', '\u180e', '\u200b', '\u001c', '\u001d', '\u001e', '\u001f', '😀', goWhitespace + 'key' + goWhitespace, 'é', 'e\u0301']) {
    const input = withArtifact({ [key]: 'legitimate string' });
    for (const parse of [parseDeliveryHistory, parseDeliveryMutation]) assert.deepEqual(parse(input), input);
  }
});
test('intent accepts U+FEFF and preserves source keys and raw Unicode escapes exactly', () => {
  for (const key of ['\ufeff', '\u0085\ufeff\u3000', '\u180e', '\u200b', '\u001c', '😀', goWhitespace + 'key' + goWhitespace, 'é', 'e\u0301']) {
    const raw = JSON.stringify({ [key]: 'legitimate string' });
    const intent = buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', raw, true, id);
    assert.ok(intent.body.endsWith(',"artifact":' + raw + '}'));
    assert.deepEqual(JSON.parse(intent.body).artifact, { [key]: 'legitimate string' });
  }
  const raw = '{"\\ufeff":"legitimate string","e\\u0301":"unchanged"}';
  assert.ok(buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', raw, true, id).body.endsWith(',"artifact":' + raw + '}'));
});
test('parser and intent reject exactly Go Unicode whitespace-only keys including U+0085', () => {
  for (const key of ['', '\u0085', ...goWhitespace, goWhitespace, '\u0085 \t\u3000']) assertKeyRejected(key);
});
test('parser and intent still reject unpaired surrogate code units in keys and values', () => {
  for (const value of ['\ud800', '\udbff', '\udc00', '\udfff', '\ud800x', 'x\udc00', '\udc00\ud800', '\ufeff\ud800']) {
    assertKeyRejected(value);
    for (const parse of [parseDeliveryHistory, parseDeliveryMutation]) assert.throws(() => parse(withArtifact({ key: value })));
    assert.throws(() => buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', JSON.stringify({ key: value }), true, id));
  }
});
test('backend-generated Unicode POST and GET snapshots remain readable without key normalization', {
  skip: !process.env.PACTRA_DELIVERY_UNICODE_RESPONSE && 'Run Go TestDeliveryUnicodeCompatibility for actual authenticated responses.',
}, () => {
  // Generated by the real handler + checker + isolated PostgreSQL, never a synthetic response.
  const fixture = JSON.parse(readFileSync(process.env.PACTRA_DELIVERY_UNICODE_RESPONSE!, 'utf8'));
  assert.deepEqual(fixture.whitespace, [...goWhitespace]);
  assert.deepEqual(fixture.post, fixture.get);
  assert.deepEqual(parseDeliveryMutation(fixture.post), fixture.post);
  for (const key of fixture.whitespace) assertKeyRejected(key);
  const history = parseDeliveryHistory(fixture.get);
  assert.deepEqual(history, fixture.get);
  assert.deepEqual(history.submissions[0].artifact, fixture.artifact);
  assert.equal(history.submissions[0].artifact['\ufeff'], 'legitimate string');
  const raw = JSON.stringify(fixture.artifact);
  const intent = buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', raw, true, id);
  assert.ok(intent.body.endsWith(',"artifact":' + raw + '}'));
  assert.deepEqual(JSON.parse(intent.body).artifact, fixture.artifact);
});
test('accepts review, revision and dispute histories tied to exact versions and hashes', () => {
  const input = submitted();
  assert.equal(parseDeliveryHistory({ ...input, state: 'accepted', reviews: [{ ...event(), decision: 'accept' }] }).state, 'accepted');
  assert.equal(parseDeliveryHistory({ ...input, state: 'revision_requested', reviews: [{ ...event(), decision: 'request_revision' }] }).state, 'revision_requested');
  assert.equal(parseDeliveryHistory({ ...input, state: 'disputed', disputes: [{ ...event(), evidence_flag: true }] }).state, 'disputed');
  const revised = { ...input, latest_version: 2, submissions: [...input.submissions, { ...input.submissions[0], version: 2 }], reviews: [{ ...event(), decision: 'request_revision' }] };
  assert.equal(parseDeliveryHistory(revised).latest_version, 2);
});
test('preserves real checker rejection instead of manufacturing pass evidence', () => {
  const input = submitted();
  const checker = { ...input.submissions[0].checker, http_status: 400, output: { error: { code: 'invalid_request', message: 'Invalid checker request.' } } };
  const result = parseDeliveryMutation({ ...input, submissions: [{ ...input.submissions[0], artifact: {}, checker }] });
  assert.deepEqual(result.submissions[0].checker.output, checker.output);
});
test('rejects malformed hashes, UUIDs, types, status and unknown private fields', () => {
  for (const patch of [
    { task_id: id.toUpperCase().replace('11111111', 'AAAAAAAA') }, { task_id: '1'.repeat(36) },
    { task_id: id.replace('-4111-', '-7111-') }, { manifest_hash: hash.toUpperCase() }, { manifest_hash: 123 },
    { manifest_hash: hash + '\n' }, { unfunded_review: 'true' }, { task_status: 'funded' }, { state: 'paid' },
    { latest_version: '0' }, { revision_limit: 6 }, { revision_limit: 1.5 }, { deliverable_id: '../raw' },
    { submissions: null }, { source: { secret: 'not part of response' } },
  ]) assert.throws(() => parseDeliveryHistory({ ...empty(), ...patch }), JSON.stringify(patch));
});
test('rejects missing fields, oversized arrays, artifact nesting/values and notes', () => {
  const input = submitted();
  for (const patch of [
    { actor: 1 }, { actor: '0x1' }, { artifact: [] }, { artifact: { key: null } }, { artifact: { key: { nested: 'bad' } } },
    { artifact: { ['k'.repeat(161)]: 'bad' } }, { artifact: { key: 'x'.repeat(100000) } },
    { artifact: { key: '\u0000' } }, { artifact: { key: '\ud800' } },
    { notes: 'a'.repeat(2001) }, { created_at: 'yesterday' }, { artifact_hash: 'not-a-hash' },
    { manifest_hash: 'c'.repeat(64) }, { version: 2 },
  ]) assert.throws(() => parseDeliveryHistory({ ...input, submissions: [{ ...input.submissions[0], ...patch }] }));
  assert.throws(() => parseDeliveryHistory({ ...input, submissions: Array(7).fill(input.submissions[0]) }));
  assert.throws(() => parseDeliveryHistory({ ...input, submissions: [{ ...input.submissions[0], artifact: Object.fromEntries(Array.from({ length: 101 }, (_, i) => ['k' + i, 'v'])) }] }));
  const missing = { ...empty() } as Record<string, unknown>; delete missing.reviews;
  assert.throws(() => parseDeliveryHistory(missing));
});
test('rejects inconsistent state, terminal transitions, stale hashes and fabricated checker enums', () => {
  const input = submitted(), checker = input.submissions[0].checker;
  for (const patch of [ { state: 'accepted' }, { latest_artifact_hash: hash }, { latest_version: 0 },
    { reviews: [{ ...event(), decision: 'accept', artifact_hash: hash }] },
    { state: 'disputed', reviews: [{ ...event(), decision: 'accept' }], disputes: [{ ...event(), evidence_flag: true }] },
    { state: 'revision_requested', revision_limit: 0, reviews: [{ ...event(), decision: 'request_revision' }] },
    { state: 'disputed', disputes: [{ ...event(), evidence_flag: false }] },
  ]) assert.throws(() => parseDeliveryHistory({ ...input, ...patch }));
  for (const patch of [ { policy: 'agreed_acceptance' }, { rules: { preserve_placeholders: true, required_terms: [] } },
    { output: { ...checker.output, passed: false } },
    { output: { ...checker.output, checks: [{ id: 'invented', key: 'greeting', status: 'pass', message: 'fake' }] } },
    { output: { ...checker.output, checks: Array(301).fill(checker.output.checks[0]) } },
    { output: { ...checker.output, ai_review: { status: 'completed', message: 'fake' } } },
  ]) assert.throws(() => parseDeliveryHistory({ ...input, submissions: [{ ...input.submissions[0], checker: { ...checker, ...patch } }] }));
});
test('raw mutation intent preserves duplicate keys for authoritative rejection and fixes UUID + payload', () => {
  const raw = '{"greeting":"first","greeting":"second"}';
  const intent = buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', raw, true, id);
  assert.ok(intent.body.includes('"artifact":' + raw));
  assert.equal(JSON.parse(intent.body).idempotency_key, id);
  assert.equal(JSON.parse(intent.body).unfunded_review, true);
  assert.equal(intent.path, '/tasks/' + id + '/deliverables/translation/submissions');
  assert.throws(() => buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', raw, false, id));
  assert.throws(() => buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', '[]', true, id));
  assert.throws(() => buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', '{"a":"' + 'x'.repeat(16384) + '"}', true, id));
  assert.throws(() => buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', '{}', true, 'INVALID'));
  assert.throws(() => buildDeliveryIntent(parseDeliveryHistory(empty()), 'accept', '', '', true, id));
});
test('artifact boundary is UTF-8 bytes and raw data including __proto__ is preserved safely', () => {
  const base = submitted();
  const raw = JSON.stringify({ x: 'a'.repeat(16376) });
  assert.equal(Buffer.byteLength(raw), 16384);
  const intent = buildDeliveryIntent(parseDeliveryHistory(empty()), 'submit', '', raw, true, id);
  assert.equal(JSON.parse(intent.body).artifact.x.length, 16376);
  assert.ok(Object.isFrozen(intent));
  const value = JSON.parse(raw);
  const artifact_hash = createHash('sha256').update(raw).digest('hex');
  assert.equal(parseDeliveryHistory({ ...base, latest_artifact_hash: artifact_hash, submissions: [{ ...base.submissions[0], artifact: value, artifact_hash }] }).submissions[0].artifact_hash, artifact_hash);
  for (const artifact of [{ x: 'a'.repeat(16377) }, { x: '😀'.repeat(5000) }]) {
    assert.throws(() => parseDeliveryHistory({ ...base, submissions: [{ ...base.submissions[0], artifact }] }));
  }
  const safe = parseDeliveryHistory({ ...base, submissions: [{ ...base.submissions[0], artifact: JSON.parse('{"__proto__":"literal"}') }] });
  assert.equal(Object.getPrototypeOf(safe.submissions[0].artifact), Object.prototype);
  assert.equal(safe.submissions[0].artifact.__proto__, 'literal');
});
test('exact review/dispute intent carries expected latest version and hash with no artifact', () => {
  const h = parseDeliveryHistory(submitted());
  for (const action of ['accept', 'request_revision', 'dispute'] as const) {
    const intent = buildDeliveryIntent(h, action, 'Notes', 'not sent', true, id);
    const body = JSON.parse(intent.body);
    assert.equal(body.expected_version, 1); assert.equal(body.artifact_hash, artifactHash);
    assert.equal(body.manifest_hash, hash); assert.equal(body.unfunded_review, true);
    assert.equal(body.artifact, undefined); assert.equal(body.decision, action === 'dispute' ? undefined : action);
    assert.equal(intent.path.endsWith(action === 'dispute' ? '/disputes' : '/reviews'), true);
  }
});
test('UI source safety wiring: identity teardown, immutable retry, real evidence and explicit acknowledgment', () => {
  // Static regression checks only; these are not a browser interaction test.
  const ui = readFileSync(new URL('../components/tasks/delivery-review.tsx', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../lib/delivery-types.ts', import.meta.url), 'utf8');
  assert.match(ui, /task\.status !== 'accepted_unfunded'/);
  assert.match(ui, /useWorkspace\(\)/);
  assert.match(ui, /key=\{scope\}/);
  assert.match(ui, /active\.current\?\.abort\(\)/);
  assert.match(ui, /held\.current = null/);
  assert.match(ui, /if \(retry\) await read\(controller\)/);
  assert.match(ui, /body: attempt\.body/);
  assert.match(ui, /const locked = .*!!review\.intent/);
  assert.match(ui, /<SessionExpired/);
  assert.match(ui, /<Checkbox\.Root[^>]*checked=\{acknowledged\}/);
  assert.match(ui, /disabled=\{!acknowledged\}/);
  assert.match(ui, /JSON\.stringify\(checker, null, 2\)/);
  assert.doesNotMatch(ui + model, /localStorage|sessionStorage|indexedDB|dangerouslySetInnerHTML|console\./);
  assert.doesNotMatch(ui, /style=|delivery_deadline|review_period_hours|setInterval/);
});
