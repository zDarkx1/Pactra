import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCleanupQueue } from '../lib/session-lifecycle.ts';
import { setWorkspaceIdentity, workspaceRequest } from '../lib/workspace-client.ts';

const firstAddress = '0x1111111111111111111111111111111111111111';
const nextAddress = '0x2222222222222222222222222222222222222222';

test('old logout operations finish in order before new login cleanup can begin', async () => {
  const queue = createSessionCleanupQueue();
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  const events: string[] = [];
  const workOne = queue(async () => { events.push('A:start'); await first.promise; events.push('A:end'); });
  const workTwo = queue(async () => { events.push('B:start'); await second.promise; events.push('B:end'); });
  const workThree = queue(async () => { events.push('C:ready'); });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(events, ['A:start']);
  first.resolve(); await workOne; await Promise.resolve();
  assert.deepEqual(events, ['A:start', 'A:end', 'B:start']);
  second.resolve(); await Promise.all([workTwo, workThree]);
  assert.deepEqual(events, ['A:start', 'A:end', 'B:start', 'B:end', 'C:ready']);
});
test('reconnect readback waits behind pending disconnect cleanup', async () => {
  const queue = createSessionCleanupQueue();
  const logout = Promise.withResolvers<void>();
  let cookiePresent = true;
  let readbackStarted = false;
  const cleanup = queue(async () => { await logout.promise; cookiePresent = false; });
  const restored = queue(async () => {}).then(() => { readbackStarted = true; return cookiePresent; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(readbackStarted, false);
  logout.resolve();
  await cleanup;
  assert.equal(await restored, false);
});
test('failed revocation does not poison a later explicit cleanup retry', async () => {
  const queue = createSessionCleanupQueue();
  await assert.rejects(queue(async () => { throw new Error('Offline'); }), /Offline/);
  let retried = false;
  await queue(async () => { retried = true; });
  assert.equal(retried, true);
});
async function withClient(run: (events: Event[]) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events: Event[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: (event: Event) => { events.push(event); return true; } } });
  try { await run(events); } finally {
    globalThis.fetch = originalFetch; setWorkspaceIdentity(null);
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
}
test('stale 401 cannot expire the new wallet session', () => withClient(async events => {
  const pending = Promise.withResolvers<Response>();
  globalThis.fetch = async () => pending.promise;
  setWorkspaceIdentity({ address: firstAddress, chainId: 31337 });
  const request = workspaceRequest('/tasks');
  setWorkspaceIdentity({ address: nextAddress, chainId: 31337 });
  pending.resolve(Response.json({ error: { message: 'Expired' } }, { status: 401 }));
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(events.length, 0);
}));
test('session changes while reading JSON are checked before global error effects', () => withClient(async events => {
  const payload = Promise.withResolvers<unknown>();
  const decoding = Promise.withResolvers<void>();
  const response = Response.json({}, { status: 401 });
  response.json = async () => { decoding.resolve(); return payload.promise; };
  globalThis.fetch = async () => response;
  setWorkspaceIdentity({ address: firstAddress, chainId: 31337 });
  const request = workspaceRequest('/tasks');
  await decoding.promise;
  setWorkspaceIdentity({ address: nextAddress, chainId: 31337 });
  payload.resolve({ error: { message: 'Expired' } });
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(events.length, 0);
}));
test('current 401 notifies the session; stale success and aborted errors do not', () => withClient(async events => {
  setWorkspaceIdentity({ address: firstAddress, chainId: 31337 });
  globalThis.fetch = async () => Response.json({ error: { message: 'Expired' } }, { status: 401 });
  await assert.rejects(workspaceRequest('/tasks'), { status: 401 });
  assert.equal(events.length, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(workspaceRequest('/tasks', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(events.length, 1);
  const pending = Promise.withResolvers<Response>();
  globalThis.fetch = async () => pending.promise;
  const request = workspaceRequest('/tasks');
  setWorkspaceIdentity({ address: nextAddress, chainId: 31337 });
  pending.resolve(Response.json({ tasks: [] }));
  await assert.rejects(request, { name: 'AbortError' });
}));
