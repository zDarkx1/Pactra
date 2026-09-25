import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDraftRequest, criteriaDiff, describeCheck, parseCriteria, parseCriteriaDraftResponse,
  summarizeCriteria, validateCriteria, type CriteriaV1,
} from '../lib/criteria.ts';

function validCriteria(): CriteriaV1 {
  return {
    criteria_version: 'criteria-v1', checker_version: 'localization-v1',
    checks: [
      { id: 'key_parity', params: {}, editable: false },
      { id: 'nonempty', params: {}, editable: false },
      { id: 'placeholders', params: { enabled: true }, editable: true },
      { id: 'required_terms', params: { terms: ['Pactra'] }, editable: true },
      { id: 'length_bounds', params: { min: 1, max: 4000 }, editable: true },
      { id: 'human_review', params: { prompt: 'Is the meaning preserved?', required: true }, editable: true },
    ],
  };
}

test('draft request keeps the brief verbatim for Go to judge', () => {
  const brief = '{"greeting":"first","greeting":"second"} keep {name}';
  const body = buildDraftRequest(brief);
  assert.equal(body, '{"brief":' + JSON.stringify(brief) + ',"gig_type":"localization"}');
  assert.equal(JSON.parse(body).brief, brief);
  assert.equal(JSON.parse(body).gig_type, 'localization');
  assert.ok(new TextEncoder().encode(body).length <= 16 * 1024);
  for (const [bad, pattern] of [['', /nonblank/], ['   ', /nonblank/], ['x'.repeat(4001), /4000/], ['bad' + String.fromCharCode(0), /nonblank/]] as const) {
    assert.throws(() => buildDraftRequest(bad), pattern);
  }
});

test('valid Rev1 criteria pass and summarize', () => {
  const criteria = validateCriteria(JSON.parse(JSON.stringify(validCriteria())));
  assert.equal(criteria.criteria_version, 'criteria-v1');
  assert.match(summarizeCriteria(criteria), /criteria-v1.*localization-v1.*6 checks/);
  assert.match(describeCheck(criteria.checks[3]), /Pactra/);
});

test('criteria reject unknown ids, keys, duplicates, and version drift', () => {
  const base = validCriteria();
  assert.throws(() => validateCriteria({ ...base, criteria_version: 'draft' }), /criteria-v1/);
  assert.throws(() => validateCriteria({ ...base, checker_version: 'other-v9' }), /localization-v1/);
  assert.throws(() => validateCriteria({ ...base, deliverable_id: 'proof-1' }), /exactly/);
  assert.throws(() => validateCriteria({ ...base, checks: [] }), /1 to 6/);
  assert.throws(() => validateCriteria({ ...base, checks: [...base.checks, ...base.checks] }), /1 to 6|used once/);
  assert.throws(() => validateCriteria({ ...base, checks: [base.checks[0], base.checks[0]] }), /used once/);
  assert.throws(() => validateCriteria({ ...base, checks: [{ id: 'release_funds', params: {}, editable: true }] }), /one of/);
  assert.throws(() => validateCriteria({ ...base, checks: [{ ...base.checks[0], extra: 1 }] }), /exactly/);
  assert.throws(() => validateCriteria({ ...base, checks: [{ ...base.checks[2], editable: false }] }), /editable/);
  assert.throws(() => validateCriteria({ ...base, checks: [{ ...base.checks[0], editable: true }] }), /fixed/);
  assert.throws(() => validateCriteria({ ...base, checks: [{ ...base.checks[2], params: { enabled: 'yes' } }] }), /boolean/);
  assert.throws(() => validateCriteria({ ...base, checks: [{ ...base.checks[2], params: {} }] }), /exactly/);
});

test('criteria mirror backend term, prompt, and bound limits', () => {
  const base = validCriteria();
  const terms = (extra: unknown) => validateCriteria({ ...base, checks: base.checks.map(check => check.id === 'required_terms' ? { ...check, params: { terms: extra } } : check) });
  assert.throws(() => terms(Array.from({ length: 31 }, () => 'ok')), /30/);
  for (const bad of ['', '   ', 'x'.repeat(101), 'é'.repeat(51)]) assert.throws(() => terms([bad]), /nonblank|100/);
  assert.doesNotThrow(() => terms(['x'.repeat(100), 'é'.repeat(50)]));
  const bounds = (min: unknown, max: unknown) => validateCriteria({ ...base, checks: base.checks.map(check => check.id === 'length_bounds' ? { ...check, params: { min, max } } : check) });
  for (const [min, max] of [[2, 1], [-1, 10], [0, 4001], [1.5, 10], ['1', 10], [NaN, 10]] as const) assert.throws(() => bounds(min, max), /min/);
  assert.doesNotThrow(() => bounds(0, 4000));
  const prompt = (value: unknown) => validateCriteria({ ...base, checks: base.checks.map(check => check.id === 'human_review' ? { ...check, params: { prompt: value, required: true } } : check) });
  assert.throws(() => prompt('x'.repeat(501)), /500/);
  assert.throws(() => prompt('   '), /nonblank/);
  const packed: CriteriaV1 = {
    ...base, checks: base.checks.map(check => {
      if (check.id === 'required_terms') return { ...check, params: { terms: Array.from({ length: 30 }, () => 'x'.repeat(100)) } };
      if (check.id === 'human_review') return { ...check, params: { prompt: 'x'.repeat(500), required: true } };
      return check;
    }),
  };
  assert.throws(() => validateCriteria(packed), /4,000/);
});

test('parse keeps legacy prose exact and promotes only valid criteria JSON', () => {
  const prose = '  Preserve meaning and {name}  ';
  assert.deepEqual(parseCriteria(prose), { kind: 'prose', text: prose });
  assert.deepEqual(parseCriteria('[1,2]'), { kind: 'prose', text: '[1,2]' });
  assert.deepEqual(parseCriteria('"quoted"'), { kind: 'prose', text: '"quoted"' });
  const raw = JSON.stringify(validCriteria());
  const parsed = parseCriteria(raw);
  assert.equal(parsed.kind, 'json');
  if (parsed.kind === 'json') assert.equal(parsed.criteria.checks.length, 6);
  assert.throws(() => parseCriteria('{"criteria_version":"criteria-v1"}'), /Structured criteria are invalid/);
  assert.throws(() => parseCriteria('{"id":"release_funds"}'), /Structured criteria are invalid/);
  for (const bad of ['', '   ', 'x'.repeat(4001), 'bad' + String.fromCharCode(0)]) {
    assert.throws(() => parseCriteria(bad), /nonblank acceptance criteria/);
  }
});

test('draft envelope accepts the Go draft and normalizes it to v1', () => {
  const criteria = validCriteria();
  assert.deepEqual(parseCriteriaDraftResponse({ status: 'draft', criteria }), { status: 'draft', criteria });
  assert.equal(parseCriteriaDraftResponse({ status: 'draft', criteria, provider: 'azure', model: 'gpt' }).provider, 'azure');
  const wire = {
    status: 'completed', provider: 'azure-foundry', model: 'gpt-6-astra', advisory: true,
    criteria: {
      criteria_version: 'criteria-v1-draft', checker_version: 'localization-v1',
      checks: [
        { id: 'key_parity', params: {} },
        { id: 'nonempty', params: {} },
        { id: 'placeholders', params: { enabled: true } },
        { id: 'required_terms', params: { terms: ['Pactra'] } },
        { id: 'human_review', params: { prompt: 'Is the meaning preserved?', required: true } },
      ],
    },
    provenance: [{ field: 'required_terms.terms', source: 'ai' }],
  };
  const draft = parseCriteriaDraftResponse(wire);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.criteria.criteria_version, 'criteria-v1');
  assert.deepEqual(draft.criteria.checks.map(check => check.editable), [false, false, true, true, true]);
  assert.deepEqual(draft.provenance, [{ field: 'required_terms.terms', source: 'ai' }]);
  assert.deepEqual(parseCriteriaDraftResponse(JSON.parse(JSON.stringify(draft))), draft);
  for (const value of [null, true, [], {}, { status: 'approved', criteria }, { status: 'draft', criteria: null },
    { status: 'draft', criteria, surprise: 1 }, { status: 'draft', criteria: { ...criteria, criteria_version: 'draft' } },
    { status: 'draft', criteria, provider: 7 }, { status: 'completed', advisory: true, findings: [] },
    { ...wire, status: 'draft' }, { ...wire, advisory: false },
    { ...wire, criteria: { ...wire.criteria, criteria_version: 'criteria-v1' } },
    { ...wire, provenance: [] }, { ...wire, criteria: { ...wire.criteria, checks: [{ id: 'release_funds', params: {} }] } }]) {
    assert.throws(() => parseCriteriaDraftResponse(value));
  }
});

test('diff lists only changed editable values', () => {
  const before = validCriteria();
  const after: CriteriaV1 = {
    ...before, checks: before.checks.map(check => check.id === 'required_terms' ? { ...check, params: { terms: ['Pactra', 'invoice'] } } : check),
  };
  const lines = criteriaDiff(before, after);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /required_terms.*Pactra.*invoice/);
  assert.deepEqual(criteriaDiff(before, before), []);
});
