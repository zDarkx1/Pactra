import assert from 'node:assert/strict';
import test from 'node:test';
import { taskMatchesSearch } from '../lib/task-list.ts';
import type { Task } from '../lib/workspace-types.ts';

const task: Task = {
  id: 'af243ee0-194e-45eb-846a-9177d6ec026e',
  status: 'invited',
  manifest_hash: 'a'.repeat(64),
  created_at: '2026-09-23T00:00:00Z',
  invite_expires_at: '2026-09-25T00:00:00Z',
  manifest: {
    version: 1, chain_id: 1, title: 'Translate the onboarding copy',
    buyer: '0x' + 'aB'.repeat(20), worker: '0x' + 'Cd'.repeat(20),
    primary_arbiter: '0x' + 'e'.repeat(40), backup_arbiter: '0x' + 'f'.repeat(40),
    source: { hello: 'Hello' }, delivery_deadline: '2026-10-01T00:00:00Z',
    invite_expires_at: '2026-09-25T00:00:00Z', total_base_units: '100',
    primary_arbiter_hours: 48, backup_arbiter_hours: 48,
    deliverables: [{ id: 'translation', title: 'French', criteria: 'Keep keys', amount_base_units: '100', revision_limit: 1, review_period_hours: 24 }],
  },
};

test('empty or whitespace search keeps loaded tasks', () => {
  for (const query of ['', ' ', '\t\n']) assert.equal(taskMatchesSearch(task, query), true);
});

test('title search is a case-insensitive substring with trimmed edges', () => {
  for (const query of ['translate', ' ONBOARDING COPY ', 'the onboarding']) assert.equal(taskMatchesSearch(task, query), true);
  assert.equal(taskMatchesSearch(task, 'copy onboarding'), false);
});

test('search matches full or partial task IDs and both party wallets', () => {
  for (const query of [task.id, 'AF243EE0', task.manifest.buyer.toUpperCase(), task.manifest.worker.toLowerCase(), 'cDcDcD']) {
    assert.equal(taskMatchesSearch(task, query), true);
  }
});

test('search ignores fields not advertised and treats symbols literally', () => {
  for (const query of ['French', 'Hello', 'invited', task.manifest.primary_arbiter, '.*', '[', 'no match']) {
    assert.equal(taskMatchesSearch(task, query), false);
  }
});

test('filtering preserves source order and does not change tasks', () => {
  const other = { ...task, id: 'another-task', manifest: { ...task.manifest, title: 'Different job' } };
  const tasks = [other, task];
  const original = JSON.stringify(tasks);
  assert.deepEqual(tasks.filter(item => taskMatchesSearch(item, 'onboarding')), [task]);
  assert.deepEqual(tasks.filter(item => taskMatchesSearch(item, '')), [other, task]);
  assert.equal(JSON.stringify(tasks), original);
});
