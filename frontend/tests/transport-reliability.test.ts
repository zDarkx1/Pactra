import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWorkspaceRequest } from '../lib/workspace-proxy.ts';
import * as client from '../lib/workspace-client.ts';
import type { Task } from '../lib/workspace-types.ts';
import { readFileSync } from 'node:fs';

// Isolated transport fixtures, not evidence of a live workspace, funds, or reviews.
const address = '0x' + '1'.repeat(40);
const id = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
const token = 'a'.repeat(64);
const auth = { cookie: 'pactra_session=' + token, 'x-pactra-address': address, 'x-pactra-chain': '31337' };
const task: Task = {
  id, status: 'accepted_unfunded', manifest_hash: 'a'.repeat(64), created_at: '2026-09-23T00:00:00Z', invite_expires_at: '2026-09-25T00:00:00Z',
  manifest: { version: 1, chain_id: 31337, buyer: address, worker: '0x' + '2'.repeat(40), primary_arbiter: '0x' + '3'.repeat(40), backup_arbiter: '0x' + '4'.repeat(40), title: 'Transport fixture', source: { greeting: 'Hello' }, delivery_deadline: '2026-10-01T00:00:00Z', total_base_units: '1', invite_expires_at: '2026-09-25T00:00:00Z', primary_arbiter_hours: 48, backup_arbiter_hours: 48, deliverables: [{ id: 'copy', title: 'Copy', criteria: 'Preserve meaning', amount_base_units: '1', revision_limit: 1, review_period_hours: 24 }] },
};
async function isolated(run: () => Promise<void>) {
  const env = { ...process.env }, fetch = globalThis.fetch;
  Object.assign(process.env, { NODE_ENV: 'development', PACTRA_APP_ORIGIN: 'https://pactra.test', PACTRA_CHAIN_ID: '31337', PACTRA_CHAIN_NAME: 'Isolated test chain', PACTRA_RPC_URL: 'http://localhost:8545', PACTRA_NATIVE_CURRENCY_NAME: 'Test', PACTRA_NATIVE_CURRENCY_SYMBOL: 'TEST', PACTRA_NATIVE_CURRENCY_DECIMALS: '18', PACTRA_ARBITERS: '', GO_API_URL: 'http://127.0.0.1:8080' });
  delete process.env.PACTRA_PUBLIC_AI_ENABLED;
  client.setWorkspaceIdentity({ address, chainId: 31337 });
  try { await run(); } finally {
    globalThis.fetch = fetch; client.setWorkspaceIdentity(null);
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
function request(path: string, method = 'GET', body?: string, headers: Record<string, string> = {}) {
  return new Request('https://pactra.test/api/workspace/' + path, { method, body, headers: { ...auth, origin: 'https://pactra.test', 'content-type': 'application/json', ...headers } });
}
function proxy(path: string, method = 'GET', body?: string, headers: Record<string, string> = {}) {
  return handleWorkspaceRequest(request(path, method, body, headers), path.split('?')[0].split('/'));
}

test('create forwards an optional UUID idempotency key and exact duplicate-key JSON once', () => isolated(async () => {
  const raw = '{ "source": {"same":"one","same":"two"} }';
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/me')) return Response.json({ address });
    writes++; assert.equal(init?.body, raw);
    assert.equal(new Headers(init?.headers).get('idempotency-key'), key);
    return Response.json(task, { status: 201 });
  };
  assert.equal((await proxy('tasks', 'POST', raw, { 'idempotency-key': key })).status, 201);
  assert.equal(writes, 1);
}));

test('malformed or combined idempotency keys fail before any upstream request', () => isolated(async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('unexpected fetch'); };
  for (const value of ['', 'not-a-uuid', key + ',' + key, '../' + key]) {
    assert.equal((await proxy('tasks', 'POST', '{}', { 'idempotency-key': value })).status, 400);
  }
  assert.equal(calls, 0);
}));

test('pagination forwards only bounded limit/cursor and projects the next cursor', () => isolated(async () => {
  globalThis.fetch = async url => {
    if (String(url).endsWith('/me')) return Response.json({ address });
    assert.equal(String(url), 'http://127.0.0.1:8080/api/v1/tasks?limit=2&cursor=opaque_cursor');
    return Response.json({ tasks: [task], next_cursor: 'next_cursor', secret: 'discard' });
  };
  const response = await proxy('tasks?limit=2&cursor=opaque_cursor');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { tasks: [task], next_cursor: 'next_cursor' });
}));

test('invalid pagination and queries on mutations never reach upstream', () => isolated(async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('unexpected fetch'); };
  for (const query of ['limit=0', 'limit=51', 'limit=1.5', 'limit=2&limit=3', 'cursor=', 'cursor=' + 'x'.repeat(1025), 'cursor=%0A', 'other=1']) {
    assert.equal((await proxy('tasks?' + query)).status, 400, query);
  }
  assert.equal((await proxy('tasks?limit=2', 'POST', '{}')).status, 400);
  assert.equal(calls, 0);
}));

test('production permits exact numeric loopback HTTP, but not hostname, aliases or remote HTTP', () => isolated(async () => {
  Object.assign(process.env, { NODE_ENV: 'production' });
  for (const base of ['http://127.0.0.1:8080', 'http://[::1]:8080', 'https://api.test']) {
    process.env.GO_API_URL = base;
    globalThis.fetch = async url => { assert.equal(new URL(String(url)).origin, base); return Response.json({ address }); };
    assert.equal((await proxy('me')).status, 200, base);
  }
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('unexpected fetch'); };
  for (const base of ['http://localhost:8080', 'http://api.test', 'http://10.0.0.1', 'http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://127.0.0.2', 'http://user@127.0.0.1', 'ftp://127.0.0.1']) {
    process.env.GO_API_URL = base;
    assert.equal((await proxy('me')).status, 502, base);
  }
  assert.equal(calls, 0);
}));

test('delivery routes enforce method, origin, session and expected wallet before writes', () => isolated(async () => {
  const base = `tasks/${id}/deliverables/copy/`;
  let writes = 0;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/me')) return Response.json({ address });
    writes++; return Response.json({ error: {} }, { status: 409 });
  };
  for (const action of ['submissions', 'reviews', 'disputes']) {
    assert.equal((await proxy(base + action, 'POST', '{}', { origin: 'https://evil.test' })).status, 403);
    assert.equal((await proxy(base + action, 'POST', '{}', { cookie: '' })).status, 401);
    assert.equal((await proxy(base + action, 'POST', '{}', { 'x-pactra-address': '0x' + '9'.repeat(40) })).status, 401);
    assert.equal((await proxy(base + action, 'POST', '{}')).status, 409);
  }
  assert.equal((await proxy(base + 'submissions')).status, 409);
  assert.equal((await proxy(base + 'reviews')).status, 405);
  assert.equal((await proxy(base + 'disputes')).status, 405);
  assert.equal((await proxy(`tasks/${id}/deliverables/bad--slug/submissions`)).status, 404);
  assert.equal(writes, 4);
}));

test('delivery mutation JSON is bounded and raw; arbitrary successful objects are rejected', () => isolated(async () => {
  const path = `tasks/${id}/deliverables/copy/submissions`;
  const raw = '{ "submission": {"x":"first","x":"last"} }';
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/me')) return Response.json({ address });
    writes++; assert.equal(init?.body, raw);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + token);
    return Response.json({ invented: true });
  };
  assert.equal((await proxy(path, 'POST', raw)).status, 502);
  assert.equal((await proxy(path, 'POST', JSON.stringify({ x: 'x'.repeat(65536) }))).status, 413);
  assert.equal(writes, 1);
}));

test('AI review is disabled by default and only exact true enables authenticated access', () => isolated(async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return Response.json({ address }); };
  for (const enabled of ['', 'false', 'TRUE', '1']) {
    process.env.PACTRA_PUBLIC_AI_ENABLED = enabled;
    assert.equal((await proxy('review', 'POST', '{}')).status, 503);
  }
  process.env.PACTRA_PUBLIC_AI_ENABLED = 'true';
  assert.equal((await proxy('review', 'POST', '{}', { cookie: '' })).status, 401);
  assert.equal((await proxy('review', 'POST', '{}', { origin: 'https://evil.test' })).status, 403);
  assert.equal((await proxy('review', 'POST', '{}', { 'x-pactra-chain': '1' })).status, 401);
  assert.equal((await proxy('review', 'POST', JSON.stringify({ source: 'x'.repeat(16384) }))).status, 413);
  assert.equal(calls, 1);
}));

const reviewInput = { source: { greeting: 'Hello' }, submission: { greeting: 'Bonjour' }, rules: [] };
const advisory = { status: 'completed', advisory: true, findings: [{ key: 'greeting', assessment: 'supported', source_excerpt: 'Hello', submission_excerpt: 'Bonjour', explanation: 'Test fixture only.' }] };
test('AI review uses 35-second timeout, authenticated raw input, and strict grounded advisory projection', () => isolated(async () => {
  process.env.PACTRA_PUBLIC_AI_ENABLED = 'true';
  const originalTimeout = AbortSignal.timeout;
  const timeouts: number[] = [];
  AbortSignal.timeout = milliseconds => { timeouts.push(milliseconds); return originalTimeout(milliseconds); };
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/me')) return Response.json({ address });
      assert.equal(String(url), 'http://127.0.0.1:8080/api/v1/review');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + token);
      assert.equal(init?.body, JSON.stringify(reviewInput));
      return Response.json({ ...advisory, provider: 'test-only', model: 'fixture' });
    };
    const response = await proxy('review', 'POST', JSON.stringify(reviewInput));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), advisory);
    assert.deepEqual(timeouts, [10000, 35000]);
  } finally { AbortSignal.timeout = originalTimeout; }
}));

test('AI rejects fabricated excerpts, missing/duplicate keys, paid conclusions and malformed schema', () => isolated(async () => {
  process.env.PACTRA_PUBLIC_AI_ENABLED = 'true';
  const finding = advisory.findings[0];
  for (const value of [
    { ...advisory, advisory: false }, { ...advisory, status: 'approved' }, { ...advisory, findings: [] },
    { ...advisory, findings: [finding, finding] }, { ...advisory, findings: [{ ...finding, key: 'invented' }] },
    { ...advisory, findings: [{ ...finding, source_excerpt: 'Invented quote' }] },
    { ...advisory, findings: [{ ...finding, assessment: 'paid' }] },
    { ...advisory, findings: [{ ...finding, explanation: '' }] },
    { ...advisory, findings: [{ ...finding, explanation: 'x'.repeat(2001) }] },
    { ...advisory, findings: [{ ...finding, approval: true }] },
  ]) {
    globalThis.fetch = async url => Response.json(String(url).endsWith('/me') ? { address } : value);
    assert.equal((await proxy('review', 'POST', JSON.stringify(reviewInput))).status, 502);
  }
}));

test('create attempt preserves UUID and raw payload through network/5xx ambiguity, with no automatic retries', () => isolated(async () => {
  const writes: { key: string | null; body: unknown }[] = [];
  const raw = '{ "source": {"greeting":"Hello"} }';
  globalThis.fetch = async (_url, init) => {
    writes.push({ key: new Headers(init?.headers).get('idempotency-key'), body: init?.body });
    if (writes.length === 1) throw new TypeError('offline');
    if (writes.length === 2) return Response.json({ error: {} }, { status: 503 });
    return Response.json(task, { status: 201 });
  };
  const attempt = client.createTaskAttempt(raw);
  await assert.rejects(attempt.send()); assert.equal(attempt.state, 'uncertain'); assert.equal(writes.length, 1);
  await assert.rejects(attempt.send()); assert.equal(attempt.state, 'uncertain'); assert.equal(writes.length, 2);
  assert.deepEqual(await attempt.send(), task); assert.equal(attempt.state, 'resolved');
  assert.match(writes[0].key!, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(writes, Array(3).fill(writes[0])); assert.equal(writes[0].body, raw);
  await assert.rejects(attempt.send()); assert.equal(writes.length, 3);
}));

test('create attempts block concurrent sends and clear payload on identity switch', () => isolated(async () => {
  const pending = Promise.withResolvers<Response>(); let calls = 0;
  globalThis.fetch = async () => { calls++; return pending.promise; };
  const attempt = client.createTaskAttempt('{}'); const first = attempt.send();
  await assert.rejects(attempt.send()); assert.equal(calls, 1);
  client.setWorkspaceIdentity({ address: '0x' + '9'.repeat(40), chainId: 31337 });
  pending.resolve(Response.json(task));
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(attempt.state, 'disposed');
  await assert.rejects(attempt.send()); assert.equal(calls, 1);
}));

test('paginated client appends/deduplicates, retains the next cursor and refreshes from the first page', () => isolated(async () => {
  const paths: string[] = [];
  const other = { ...task, id: key };
  globalThis.fetch = async url => {
    paths.push(String(url));
    return Response.json(paths.length === 1 ? { tasks: [task], next_cursor: 'page2' } : paths.length === 2 ? { tasks: [task, other], next_cursor: null } : { tasks: [other], next_cursor: null });
  };
  const pager = client.createTaskPager(() => {});
  await pager.reload(); await pager.loadMore();
  assert.deepEqual(pager.snapshot.data?.tasks, [task, other]);
  assert.equal(pager.snapshot.data?.next_cursor, null);
  await pager.loadMore(); assert.equal(paths.length, 2);
  await pager.reload(); assert.deepEqual(pager.snapshot.data?.tasks, [other]);
  assert.deepEqual(paths, ['/api/workspace/tasks?limit=50', '/api/workspace/tasks?limit=50&cursor=page2', '/api/workspace/tasks?limit=50']);
  pager.dispose();
}));

test('refresh aborts load-more and stale page cannot overwrite newer data; identity clears pages', () => isolated(async () => {
  const pending = Promise.withResolvers<Response>(); const signals: AbortSignal[] = []; let calls = 0;
  globalThis.fetch = async (_url, init) => {
    signals.push(init!.signal!); calls++;
    if (calls === 2) return pending.promise;
    return Response.json({ tasks: calls === 1 ? [task] : [], next_cursor: calls === 1 ? 'page2' : null });
  };
  const pager = client.createTaskPager(() => {});
  await pager.reload(); const more = pager.loadMore();
  await pager.reload(); assert.equal(signals[1].aborted, true);
  pending.resolve(Response.json({ tasks: [task], next_cursor: 'page3' })); await more;
  assert.deepEqual(pager.snapshot.data?.tasks, []);
  client.setWorkspaceIdentity(null); assert.equal(pager.snapshot.data, null);
  pager.dispose();
}));

test('review and delivery client responses discard stale identity during JSON decoding', () => isolated(async () => {
  for (const path of ['/review', `/tasks/${id}/deliverables/copy/submissions`]) {
    client.setWorkspaceIdentity({ address, chainId: 31337 });
    const decoding = Promise.withResolvers<void>(), payload = Promise.withResolvers<unknown>();
    const response = Response.json({}); response.json = async () => { decoding.resolve(); return payload.promise; };
    globalThis.fetch = async () => response;
    const work = client.workspaceRequest(path, { method: 'POST', body: JSON.stringify(reviewInput) });
    await decoding.promise; client.setWorkspaceIdentity(null); payload.resolve(advisory);
    await assert.rejects(work, { name: 'AbortError' });
  }
}));

test('definite rejection releases an unused attempt but later rejection never unlocks an ambiguous attempt', () => isolated(async () => {
  globalThis.fetch = async () => Response.json({ error: {} }, { status: 400 });
  const rejected = client.createTaskAttempt('{}');
  await assert.rejects(rejected.send(), { status: 400 }); assert.equal(rejected.state, 'rejected');
  await assert.rejects(rejected.send(), { status: 409 });
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  const uncertain = client.createTaskAttempt('{}'); await assert.rejects(uncertain.send());
  globalThis.fetch = async () => Response.json({ error: {} }, { status: 400 });
  await assert.rejects(uncertain.send(), { status: 400 }); assert.equal(uncertain.state, 'uncertain');
  uncertain.dispose();
}));

test('invalid success and timeout retain create key; disposal aborts transport without replay', () => isolated(async () => {
  const keys: (string | null)[] = [];
  globalThis.fetch = async (_url, init) => {
    keys.push(new Headers(init?.headers).get('idempotency-key'));
    if (keys.length === 1) throw new DOMException('timeout', 'TimeoutError');
    return Response.json({ ...task, status: 'funded' });
  };
  const attempt = client.createTaskAttempt('{}');
  await assert.rejects(attempt.send()); await assert.rejects(attempt.send(), { status: 502 });
  assert.equal(attempt.state, 'uncertain'); assert.equal(keys[0], keys[1]);
  const pending = Promise.withResolvers<Response>(); let signal: AbortSignal | null = null;
  globalThis.fetch = async (_url, init) => { signal = init!.signal!; return pending.promise; };
  const work = attempt.send(); attempt.dispose(); assert.equal(signal!.aborted, true);
  pending.resolve(Response.json(task)); await assert.rejects(work, { name: 'AbortError' });
  assert.equal(attempt.state, 'disposed');
}));

test('page failures preserve loaded rows and retry cursor; malformed or looping pages cannot append', () => isolated(async () => {
  const pager = client.createTaskPager(() => {}); let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    if (calls === 1) return Response.json({ tasks: [task], next_cursor: 'next' });
    assert.equal(String(url), '/api/workspace/tasks?limit=50&cursor=next');
    if (calls === 2) return Response.json({ error: {} }, { status: 503 });
    if (calls === 3) return Response.json({ tasks: [task], next_cursor: 'next' });
    return Response.json({ tasks: Array(51).fill(task), next_cursor: null });
  };
  await pager.reload();
  for (let i = 0; i < 3; i++) {
    await pager.loadMore(); assert.deepEqual(pager.snapshot.data, { tasks: [task], next_cursor: 'next' });
    assert.ok(pager.snapshot.error instanceof client.WorkspaceError); assert.equal(pager.snapshot.loading, false);
  }
  globalThis.fetch = async () => Response.json({ error: {} }, { status: 403 });
  await pager.loadMore(); assert.equal(pager.snapshot.data, null); pager.dispose();
}));

test('client validates exact routes and methods before fetching and sends same-origin no-store requests', () => isolated(async () => {
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++; assert.equal(init?.credentials, 'same-origin'); assert.equal(init?.cache, 'no-store'); assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('x-pactra-address'), address);
    assert.equal(new Headers(init?.headers).get('x-pactra-chain'), '31337');
    return Response.json({ tasks: [], next_cursor: null });
  };
  for (const path of ['//evil.test/tasks', '/tasks/not-a-uuid', `/tasks/${id}/deliverables/bad--slug/submissions`, '/tasks/../me', '/tasks%2f' + id, '/tasks?limit=100', '/tasks#fragment']) await assert.rejects(client.workspaceRequest(path), { status: 400 });
  await assert.rejects(client.workspaceRequest('/review'), { status: 405 });
  assert.equal(calls, 0);
  assert.deepEqual(await client.workspaceRequest('/tasks?limit=50'), { tasks: [], next_cursor: null });
  assert.equal(calls, 1);
}));

test('task UI wires frozen manual retry and load-more with teardown, never source storage', () => {
  const form = readFileSync(new URL('../components/tasks/task-form.tsx', import.meta.url), 'utf8');
  const list = readFileSync(new URL('../components/tasks/task-list.tsx', import.meta.url), 'utf8');
  const transport = readFileSync(new URL('../lib/workspace-client.ts', import.meta.url), 'utf8');
  assert.match(form, /attempt\.current = createTaskAttempt\(checked\.body\)/);
  assert.match(form, /attempt\.current\.send\(controller\.signal\)/);
  assert.match(form, /disabled=\{pending \|\| uncertain\}/);
  assert.match(form, /disabled=\{pending \|\| blocked\}/);
  assert.match(form, /Retry same invitation/);
  assert.match(form, /attempt\.current\?\.dispose\(\)/);
  assert.match(list, /createTaskPager/); assert.match(list, /current\.dispose\(\)/);
  assert.match(list, /data\.next_cursor &&/); assert.match(list, /pager\.current\?\.loadMore\(\)/);
  assert.doesNotMatch(form + transport, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(list, /No pagination yet|Newest 50 tasks only/);
});

test('valid delivery snapshots pass both transports without changing accepted_unfunded', () => isolated(async () => {
  const history = { task_id: id, deliverable_id: 'copy', task_status: 'accepted_unfunded', unfunded_review: true, manifest_hash: task.manifest_hash, state: 'not_submitted', latest_version: 0, latest_artifact_hash: '', revision_limit: 1, submissions: [], reviews: [], disputes: [] };
  globalThis.fetch = async url => Response.json(String(url).endsWith('/me') ? { address } : history);
  const path = `tasks/${id}/deliverables/copy/submissions`;
  const response = await proxy(path);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), history);
  assert.deepEqual(await client.workspaceRequest('/' + path), history);
  assert.deepEqual(await client.workspaceRequest('/' + path, { method: 'POST', body: '{}' }), history);
  for (const mutation of ['submissions', 'reviews', 'disputes']) {
    const result = await proxy(`tasks/${id}/deliverables/copy/${mutation}`, 'POST', '{}');
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), history);
  }
  for (const patch of [{ task_id: key }, { deliverable_id: 'other' }]) {
    globalThis.fetch = async url => Response.json(String(url).endsWith('/me') ? { address } : { ...history, ...patch });
    assert.equal((await proxy(path)).status, 502);
    await assert.rejects(client.workspaceRequest('/' + path), { status: 502 });
  }
}));

test('malformed query escapes and fragment selectors are rejected, not repaired', () => isolated(async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('unexpected'); };
  for (const query of ['cursor=%zz', 'cursor=next#fragment', 'limit=1&', 'cursor=next&&limit=1']) await assert.rejects(client.workspaceRequest('/tasks?' + query), { status: 400 });
  assert.equal(calls, 0);
}));

test('parent review route delegates to the same disabled/authenticated BFF', () => isolated(async () => {
  const { POST } = await import('../app/api/review/route.ts');
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('unexpected'); };
  const disabled = await POST(request('review', 'POST', '{}'));
  assert.equal(disabled.status, 503);
  process.env.PACTRA_PUBLIC_AI_ENABLED = 'true';
  assert.equal((await POST(request('review', 'POST', '{}', { cookie: '' }))).status, 401);
  assert.equal(calls, 0);
}));
