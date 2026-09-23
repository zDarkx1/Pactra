import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRawRequest, validateStringObject, invalidateResult } from '../lib/check-input.ts';

test('raw source and submission preserve duplicate keys for server rejection', () => {
  const source = '{"brand":"first", "brand":"Pactra"}';
  const submission = '{"brand":"one", "brand":"two"}';
  const body = buildRawRequest({ source, submission, preservePlaceholders: true, requiredTerms: 'Pactra, invoice' });
  assert.ok(body.includes('"source":' + source));
  assert.ok(body.includes('"submission":' + submission));
  assert.deepEqual(JSON.parse(body).rules, { preserve_placeholders: true, required_terms: ['Pactra', 'invoice'] });
});

test('only plain JSON objects containing strings are accepted', () => {
  for (const raw of ['null', '[]', '"text"', '2', 'true', '{"a":2}', '{"a":null}', '{"a":{}}', '{"a":[]}', '{oops', '']) {
    assert.throws(() => validateStringObject(raw, 'Source'), /Source/);
  }
  assert.doesNotThrow(() => validateStringObject('{}', 'Source'));
  assert.doesNotThrow(() => validateStringObject('{"__proto__":"safe","x":"hello"}', 'Source'));
});

test('request validates both documents and safely escapes terms', () => {
  assert.throws(() => buildRawRequest({ source: '{}', submission: '[]', preservePlaceholders: false, requiredTerms: '' }));
  const body = buildRawRequest({ source: '{}', submission: '{}', preservePlaceholders: false, requiredTerms: 'a"b,  ,Pactra' });
  assert.deepEqual(JSON.parse(body).rules.required_terms, ['a"b', 'Pactra']);
});

test('editing invalidates result, error, and in-flight display state', () => {
  assert.deepEqual(invalidateResult(), { result: null, error: null, loading: false });
});
