import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiweMessage } from 'viem/siwe';
import { handleWorkspaceRequest } from '../lib/workspace-proxy.ts';
import { getPublicWorkspaceConfig } from '../lib/workspace-config.ts';
import { parseTask } from '../lib/workspace-types.ts';
import { POST as review } from '../app/api/review/route.ts';

const address = '0x1111111111111111111111111111111111111111';
const challengeId = '11111111-1111-4111-8111-111111111111';
const token = 'a'.repeat(64);
const environment = {
  PACTRA_APP_ORIGIN: 'https://pactra.test', PACTRA_CHAIN_ID: '31337',
  PACTRA_CHAIN_NAME: 'Isolated test chain', PACTRA_RPC_URL: 'http://localhost:8545',
  PACTRA_NATIVE_CURRENCY_NAME: 'Test units', PACTRA_NATIVE_CURRENCY_SYMBOL: 'TEST',
  PACTRA_NATIVE_CURRENCY_DECIMALS: '18', PACTRA_ARBITERS: '',
};
async function configured(run: () => Promise<void>) {
  const before = { ...process.env };
  const original = globalThis.fetch;
  Object.assign(process.env, environment);
  try { await run(); } finally {
    globalThis.fetch = original;
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
}
function request(path: string, body?: string, extra: Record<string, string> = {}) {
  return new Request('http://internal-next:3000/api/workspace/' + path, {
    method: body === undefined ? 'GET' : 'POST', body,
    headers: { origin: 'https://pactra.test', 'content-type': 'application/json', ...extra },
  });
}
const authHeaders = { cookie: 'pactra_session=' + token, 'x-pactra-address': address, 'x-pactra-chain': '31337' };

test('workspace disabled without verified chain; never invent network or arbiters', () => {
  assert.equal(getPublicWorkspaceConfig({ NODE_ENV: 'development' }).enabled, false);
  const config = getPublicWorkspaceConfig(environment);
  assert.equal(config.enabled, true);
  assert.deepEqual(config.arbiters, []);
  assert.equal(config.walletConnectProjectId, null);
  assert.equal(getPublicWorkspaceConfig({ ...environment, PACTRA_RPC_URL: 'https://secret@rpc.test' }).enabled, false);
});
test('state-changing requests require exact configured origin even behind Next', () => configured(async () => {
  globalThis.fetch = async () => { throw new Error('must not fetch'); };
  const result = await handleWorkspaceRequest(request('auth/challenge', '{}', { origin: 'https://evil.test' }), ['auth', 'challenge']);
  assert.equal(result.status, 403);
  const absent = request('auth/challenge', '{}'); absent.headers.delete('origin');
  assert.equal((await handleWorkspaceRequest(absent, ['auth', 'challenge'])).status, 403);
}));
test('challenge message and audience preserved; bound HttpOnly cookie returned', () => configured(async () => {
  const expiresAt = new Date(Date.now() + 300000);
  const message = createSiweMessage({ address, chainId: 31337, domain: 'pactra.test', uri: 'https://pactra.test', version: '1', nonce: 'abc123def456abc123def456abc123de', issuedAt: new Date(), expirationTime: expiresAt, statement: 'Sign in to Pactra.' });
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:8080/api/v1/auth/challenge');
    assert.equal(init?.body, JSON.stringify({ address }));
    return Response.json({ challenge_id: challengeId, message, expires_at: expiresAt.toISOString() }, { status: 201 });
  };
  const result = await handleWorkspaceRequest(request('auth/challenge', JSON.stringify({ address })), ['auth', 'challenge']);
  assert.equal(result.status, 201);
  assert.equal((await result.json()).message, message);
  assert.match(result.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
  assert.match(result.headers.get('set-cookie')!, /Secure/);
}));
test('challenge with wrong chain is not sent to the wallet', () => configured(async () => {
  const message = createSiweMessage({ address, chainId: 1, domain: 'pactra.test', uri: 'https://pactra.test', version: '1', nonce: 'abc123def456abc123def456abc123de' });
  globalThis.fetch = async () => Response.json({ challenge_id: challengeId, message, expires_at: new Date(Date.now() + 300000).toISOString() }, { status: 201 });
  const result = await handleWorkspaceRequest(request('auth/challenge', JSON.stringify({ address })), ['auth', 'challenge']);
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('set-cookie'), null);
}));
test('verify keeps bearer out of browser JSON and binds challenge to this browser', () => configured(async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ token, token_type: 'Bearer', address, expires_at: new Date(Date.now() + 86400000).toISOString(), ignored_secret: 'never relay' }); };
  const body = JSON.stringify({ challenge_id: challengeId, signature: '0x123' });
  assert.equal((await handleWorkspaceRequest(request('auth/verify', body), ['auth', 'verify'])).status, 401);
  assert.equal(calls, 0);
  const result = await handleWorkspaceRequest(request('auth/verify', body, { cookie: 'pactra_challenge=' + challengeId + '.' + address }), ['auth', 'verify']);
  assert.equal(result.status, 200);
  const output = await result.json();
  assert.equal(output.address, address);
  assert.equal(output.token, undefined);
  assert.equal(output.ignored_secret, undefined);
  assert.match(result.headers.get('set-cookie')!, /pactra_session=/);
  assert.match(result.headers.get('cache-control')!, /no-store/);
}));
test('task calls require session and live-wallet address/chain match', () => configured(async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ address }); };
  assert.equal((await handleWorkspaceRequest(request('tasks'), ['tasks'])).status, 401);
  assert.equal(calls, 0);
  const result = await handleWorkspaceRequest(request('tasks', undefined, { ...authHeaders, 'x-pactra-address': '0x2222222222222222222222222222222222222222' }), ['tasks']);
  assert.equal(result.status, 401);
  assert.equal(calls, 1);
}));
test('private lists are bounded, projected, and never publicly cacheable', () => configured(async () => {
  globalThis.fetch = async url => String(url).endsWith('/me') ? Response.json({ address }) : Response.json({ tasks: [], secret: 'do not relay' });
  const result = await handleWorkspaceRequest(request('tasks', undefined, authHeaders), ['tasks']);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { tasks: [] });
  assert.match(result.headers.get('cache-control')!, /private/);
  assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow');
}));
test('raw duplicate source keys reach Go; create is never retried', () => configured(async () => {
  const raw = '{"source":{"key":"first","key":"second"}}';
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/me')) return Response.json({ address });
    writes++; assert.equal(init?.body, raw);
    return Response.json({ error: 'Bad Request' }, { status: 400 });
  };
  assert.equal((await handleWorkspaceRequest(request('tasks', raw, authHeaders), ['tasks'])).status, 400);
  assert.equal(writes, 1);
}));
test('timeout is uncertain, error details are not leaked, routes cannot select a target', () => configured(async () => {
  globalThis.fetch = async () => { throw new DOMException('private host details', 'TimeoutError'); };
  const result = await handleWorkspaceRequest(request('me', undefined, authHeaders), ['me']);
  assert.equal(result.status, 504);
  assert.ok(!(await result.text()).includes('private host'));
  assert.equal((await handleWorkspaceRequest(request('tasks'), ['tasks', '..'])).status, 404);
}));
test('logout calls Go and clears local cookies only after revocation response', () => configured(async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:8080/api/v1/auth/logout');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + token);
    return new Response(null, { status: 204 });
  };
  const result = await handleWorkspaceRequest(request('auth/logout', '{}', authHeaders), ['auth', 'logout']);
  assert.equal(result.status, 204);
  assert.match(result.headers.get('set-cookie')!, /Max-Age=0/);
}));
test('public production AI stays disabled at the route, not only the button', () => configured(async () => {
  Object.assign(process.env, { NODE_ENV: 'production' });
  globalThis.fetch = async () => { throw new Error('must not call paid provider'); };
  delete process.env.PACTRA_PUBLIC_AI_ENABLED;
  const result = await review(new Request('https://pactra.test/api/review', { method: 'POST', headers: {Origin:'https://pactra.test', 'Content-Type':'application/json'}, body: '{}' }));
  assert.equal(result.status, 503);
}));
test('task parser rejects invented funded status and malformed manifests', () => {
  assert.throws(() => parseTask({ status: 'paid' }));
  assert.throws(() => parseTask(null));
});
test('logout without a cookie is idempotent and clears both cookies without calling Go', () => configured(async () => {
  globalThis.fetch = async () => { throw new Error('must not call Go without a token'); };
  const result = await handleWorkspaceRequest(request('auth/logout', '{}'), ['auth', 'logout']);
  assert.equal(result.status, 204);
  assert.match(result.headers.get('set-cookie')!, /pactra_session=;.*Max-Age=0/);
  assert.match(result.headers.get('set-cookie')!, /pactra_challenge=;.*Max-Age=0/);
}));
test('401 responses never delete cookies that may belong to a newer session', () => configured(async () => {
  const missing = await handleWorkspaceRequest(request('me'), ['me']);
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get('set-cookie'), null);
  globalThis.fetch = async () => Response.json({ error: 'Unauthorized' }, { status: 401 });
  const expired = await handleWorkspaceRequest(request('me', undefined, authHeaders), ['me']);
  assert.equal(expired.status, 401);
  assert.equal(expired.headers.get('set-cookie'), null);
  const wrongChallenge = await handleWorkspaceRequest(request('auth/verify', JSON.stringify({ challenge_id: challengeId, signature: '0x123' })), ['auth', 'verify']);
  assert.equal(wrongChallenge.status, 401);
  assert.equal(wrongChallenge.headers.get('set-cookie'), null);
}));
