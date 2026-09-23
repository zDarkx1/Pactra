import assert from 'node:assert/strict';
import test from 'node:test';
import { createNavigationFocus } from '../lib/navigation-focus.ts';

test('navigation focus is requested for exactly one destination', () => {
  const intent = createNavigationFocus();
  assert.equal(intent.consume('/tasks'), false);
  intent.request('/checker');
  assert.equal(intent.consume('/checker'), true);
  assert.equal(intent.consume('/checker'), false);
});

test('a different route does not inherit stale drawer focus', () => {
  const intent = createNavigationFocus();
  intent.request('/checker');
  assert.equal(intent.consume('/tasks/new'), false);
  assert.equal(intent.consume('/checker'), false);
});

test('further input cancels pending focus instead of stealing it later', () => {
  const intent = createNavigationFocus();
  intent.request('/checker');
  intent.clear();
  assert.equal(intent.consume('/checker'), false);
});

test('the newest navigation replaces an earlier destination', () => {
  const intent = createNavigationFocus();
  intent.request('/tasks');
  intent.request('/checker');
  assert.equal(intent.consume('/checker'), true);
});
