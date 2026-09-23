import test from 'node:test';
import assert from 'node:assert/strict';
import { deadlineToUtc, isTaskAddress, newTaskDraft, parseTaskSource, UINT256_MAX, validateTaskDraft } from '../lib/task-form.ts';

const now = Date.parse('2026-09-23T12:00:00Z');
const buyer = '0x' + '1'.repeat(40);
const worker = '0x' + '2'.repeat(40);
const arbiters = ['0x' + 'a'.repeat(40), '0x' + 'b'.repeat(40)];
const slash = String.fromCharCode(92);

function validDraft() {
  const draft = newTaskDraft(now);
  return {
    ...draft, title: 'Translate the source', worker, primary_arbiter: arbiters[0], backup_arbiter: arbiters[1],
    deliverables: [{ ...draft.deliverables[0], title: 'Indonesian', criteria: 'Preserve placeholders.', amount_base_units: '9007199254740993' }],
  };
}

test('create payload matches contract and keeps large amounts as exact strings', () => {
  const draft = validDraft();
  draft.primary_arbiter = '0x' + 'A'.repeat(40);
  const result = validateTaskDraft(draft, buyer, arbiters, now);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, '9007199254740993');
  assert.equal(result.input.primary_arbiter, arbiters[0]);
  assert.equal(result.input.delivery_deadline, '2026-09-24T12:00:00Z');
  assert.equal(typeof result.input.deliverables[0].revision_limit, 'number');
  assert.equal(JSON.parse(result.body).deliverables[0].amount_base_units, '9007199254740993');
  assert.deepEqual(Object.keys(result.input).sort(), ['title', 'source', 'worker', 'primary_arbiter', 'backup_arbiter', 'delivery_deadline', 'deliverables'].sort());
});

test('uint256 boundary and total overflow are checked without floating point', () => {
  const draft = validDraft();
  for (const amount of ['0', '01', '-1', '+1', '1.0', '1e3', ' 1', '1 ', (UINT256_MAX + BigInt(1)).toString(), '9'.repeat(79)]) {
    draft.deliverables[0].amount_base_units = amount;
    assert.equal(validateTaskDraft(draft, buyer, arbiters, now).ok, false, amount);
  }
  draft.deliverables[0].amount_base_units = UINT256_MAX.toString();
  assert.equal(validateTaskDraft(draft, buyer, arbiters, now).ok, true);
  draft.deliverables.push({ ...draft.deliverables[0], id: 'second', amount_base_units: '1' });
  const overflow = validateTaskDraft(draft, buyer, arbiters, now);
  assert.equal(overflow.ok, false);
  if (!overflow.ok) assert.match(overflow.errors.deliverables, /sum/);
});

test('deadline defaults and parsing use explicit UTC with exact time boundaries', () => {
  const draft = validDraft();
  assert.equal(draft.delivery_deadline, '2026-09-24T12:00');
  for (const [value, valid] of [
    ['2026-09-23T12:59', false], ['2026-09-23T13:00', true],
    ['2026-12-22T12:00', true], ['2026-12-22T12:01', false],
    ['2026-02-30T12:00', false], ['2026-09-23T25:00', false], ['', false],
  ] as const) {
    draft.delivery_deadline = value;
    assert.equal(validateTaskDraft(draft, buyer, arbiters, now).ok, valid, value);
  }
  draft.delivery_deadline = '2026-09-23T13:00';
  assert.equal(validateTaskDraft(draft, buyer, arbiters, now + 1).ok, false);
  assert.equal(deadlineToUtc('2026-09-24T12:00'), '2026-09-24T12:00:00Z');
  assert.equal(deadlineToUtc('2026-02-30T12:00'), null);
  assert.equal(deadlineToUtc('2026-09-24T12:00Z'), null);
});

test('source rejects duplicates including escaped aliases instead of overwriting', () => {
  for (const source of ['{"x":"one","x":"two"}', '{"x":"one","' + slash + 'u0078":"two"}', '{"__proto__":"one","__proto__":"two"}', '{"x":3,"x":"last"}']) {
    assert.throws(() => parseTaskSource(source));
  }
  assert.throws(() => parseTaskSource('{"x":"one","' + slash + 'u0078":"two"}'), /Duplicate/);
});

test('source preserves case, whitespace, empty values, escapes, and prototype-like keys', () => {
  const original = JSON.parse('{"worker":"","Worker":"  keep  ","__proto__":"safe","constructor":"safe too"}');
  original.quote = 'say "hi"';
  original.path = 'folder' + slash + 'file';
  original.line = String.fromCharCode(10, 9, 13);
  const source = parseTaskSource(' ' + JSON.stringify(original) + ' ');
  assert.equal(source.worker, '');
  assert.equal(source.Worker, '  keep  ');
  assert.equal(source.__proto__, 'safe');
  assert.equal(source.constructor, 'safe too');
  assert.equal(source.quote, 'say "hi"');
  assert.equal(source.line, original.line);
  assert.equal(source.path, original.path);
  assert.deepEqual(JSON.parse(JSON.stringify(source)), original);
  assert.deepEqual(JSON.parse(JSON.stringify(parseTaskSource('{}'))), {});
});

test('source rejects non-flat data, trailing content, invalid Unicode, and malformed JSON', () => {
  for (const source of ['null', '[]', '{"a":null}', '{"a":{}}', '{"a":[]}', '{"a":1}', '{"a":"ok",}', '{"a":"ok"} {}', '{"":"x"}', '{"  ":"x"}', '{"x":"' + slash + 'ud800"}', '{"x":"' + slash + 'udc00"}', '{"x":"' + slash + 'u0000"}', '{"x":"bad' + slash + 'q"}', String.fromCharCode(0xfeff) + '{}']) {
    assert.throws(() => parseTaskSource(source), /./, source);
  }
  assert.equal(parseTaskSource('{"x":"' + slash + 'ud83d' + slash + 'ude00"}').x, '😀');
});

test('source limits count Unicode characters and Go JSON bytes with HTML escaping', () => {
  assert.doesNotThrow(() => parseTaskSource(JSON.stringify({ ['😀'.repeat(160)]: '' })));
  assert.throws(() => parseTaskSource(JSON.stringify({ ['😀'.repeat(161)]: '' })));
  assert.doesNotThrow(() => parseTaskSource(JSON.stringify(Object.fromEntries(Array.from({ length: 100 }, (_, index) => ['key-' + index, ''])))));
  assert.throws(() => parseTaskSource(JSON.stringify(Object.fromEntries(Array.from({ length: 101 }, (_, index) => ['key-' + index, ''])))));
  assert.doesNotThrow(() => parseTaskSource(JSON.stringify({ key: 'x'.repeat(16374) })));
  assert.throws(() => parseTaskSource(JSON.stringify({ key: 'x'.repeat(16375) })));
  for (const character of ['<', '>', '&', String.fromCharCode(8232), String.fromCharCode(8233)]) {
    assert.throws(() => parseTaskSource(JSON.stringify({ key: character.repeat(2800) })), /16 KiB/);
  }
});

test('participants must be valid, nonzero, distinct, and officially allowed', () => {
  assert.equal(isTaskAddress('0x' + '0'.repeat(40)), false);
  for (const patch of [{ worker: buyer }, { worker: arbiters[0] }, { backup_arbiter: arbiters[0] }, { primary_arbiter: '0x' + 'f'.repeat(40) }, { worker: '0x123' }]) {
    assert.equal(validateTaskDraft({ ...validDraft(), ...patch }, buyer, arbiters, now).ok, false);
  }
  assert.equal(validateTaskDraft(validDraft(), buyer, [], now).ok, false);
  assert.equal(validateTaskDraft(validDraft(), 'bad', arbiters, now).ok, false);
});

test('deliverable count, slug uniqueness, policies, and text bounds match the API', () => {
  const draft = validDraft();
  for (const patch of [{ id: 'Bad' }, { id: 'bad--slug' }, { id: 'a'.repeat(65) }, { title: ' ' }, { criteria: 'x'.repeat(4001) }, { revision_limit: '6' }, { revision_limit: '-1' }, { review_period_hours: '23' }, { review_period_hours: '169' }, { review_period_hours: '24.5' }]) {
    assert.equal(validateTaskDraft({ ...draft, deliverables: [{ ...draft.deliverables[0], ...patch }] }, buyer, arbiters, now).ok, false);
  }
  assert.equal(validateTaskDraft({ ...draft, deliverables: [] }, buyer, arbiters, now).ok, false);
  assert.equal(validateTaskDraft({ ...draft, deliverables: [draft.deliverables[0], draft.deliverables[0]] }, buyer, arbiters, now).ok, false);
  assert.equal(validateTaskDraft({ ...draft, deliverables: Array.from({ length: 11 }, (_, index) => ({ ...draft.deliverables[0], id: 'item-' + index })) }, buyer, arbiters, now).ok, false);
  assert.equal(validateTaskDraft({ ...draft, title: '😀'.repeat(160) }, buyer, arbiters, now).ok, true);
  for (const title of ['😀'.repeat(161), String.fromCharCode(0xd800), 'hello' + String.fromCharCode(0), '', String.fromCharCode(0x85)]) {
    assert.equal(validateTaskDraft({ ...draft, title }, buyer, arbiters, now).ok, false);
  }
});

test('full body limit is enforced after encoding and draft text is not trimmed', () => {
  const draft = validDraft();
  draft.title = '  Exact title  ';
  draft.source = '{"key":"  exact value  "}';
  const result = validateTaskDraft(draft, buyer, arbiters, now);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.title, draft.title);
    assert.equal(result.input.source.key, '  exact value  ');
  }
  draft.deliverables = Array.from({ length: 10 }, (_, index) => ({ ...draft.deliverables[0], id: 'part-' + index, criteria: '😀'.repeat(4000) }));
  const tooLarge = validateTaskDraft(draft, buyer, arbiters, now);
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) assert.match(tooLarge.errors._form, /64 KiB/);
});
