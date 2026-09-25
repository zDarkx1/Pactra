import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWorkspaceRequest } from '../lib/workspace-proxy.ts';
import { setWorkspaceIdentity, workspaceRequest } from '../lib/workspace-client.ts';
const address = '0x1111111111111111111111111111111111111111';
const id = '11111111-1111-4111-8111-111111111111';
const headers = { origin: 'https://pactra.test', 'content-type': 'application/json', cookie: 'pactra_session=' + 'a'.repeat(64), 'x-pactra-address': address, 'x-pactra-chain': '31337' };
const environment = { PACTRA_APP_ORIGIN: 'https://pactra.test', PACTRA_CHAIN_ID: '31337', PACTRA_CHAIN_NAME: 'Fixture', PACTRA_RPC_URL: 'http://localhost:8545', PACTRA_NATIVE_CURRENCY_NAME: 'Test', PACTRA_NATIVE_CURRENCY_SYMBOL: 'TEST', PACTRA_NATIVE_CURRENCY_DECIMALS: '18' };
async function isolated(run: () => Promise<void>) {
  const before = { ...process.env }, fetch = globalThis.fetch;
  Object.assign(process.env, environment);
  try { await run(); } finally { globalThis.fetch = fetch; setWorkspaceIdentity(null); for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]; Object.assign(process.env, before); }
}
function request(path: string, body?: string, origin = headers.origin) { return new Request('http://internal/api/workspace/' + path, { method: body ? 'POST' : 'GET', headers: { ...headers, origin }, body }); }
test('settlement writes retain exact-origin protection and no arbitrary signing route', () => isolated(async () => {
  globalThis.fetch = async () => { assert.fail('upstream must not run'); };
  const path = `tasks/${id}/onchain/reconcile`;
  assert.equal((await handleWorkspaceRequest(request(path, '{}', 'https://pactra.test.evil'), path.split('/'))).status, 403);
  assert.equal((await handleWorkspaceRequest(request('onchain/sign', '{}'), ['onchain','sign'])).status, 404);
}));
test('arbiter queue is authenticated no-store and projects away backend secrets', () => isolated(async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + 'a'.repeat(64));
    return Response.json(String(url).endsWith('/me') ? { address } : { disputes: [], next_cursor: null, signing_key: 'never relay' });
  };
  const response = await handleWorkspaceRequest(request('arbiter/disputes?limit=50'), ['arbiter','disputes']);
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control')!, /no-store, private/);
  assert.deepEqual(await response.json(), { disputes: [], next_cursor: null });
  const noSession = request('arbiter/disputes'); noSession.headers.delete('cookie');
  assert.equal((await handleWorkspaceRequest(noSession, ['arbiter','disputes'])).status, 401);
}));
test('disabled backend config passes through without secrets and without fictitious deployment', () => isolated(async () => {
  globalThis.fetch = async url => Response.json(String(url).endsWith('/me') ? { address } : { enabled: false, chain_id: '31337', escrow_address: '', confirmations: 0, attestation_available: false, key: 'never' });
  const response = await handleWorkspaceRequest(request('onchain/config'), ['onchain','config']);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { enabled: false, chain_id: '31337', escrow_address: '', confirmations: 0, attestation_available: false });
}));
test('identity change discards delayed arbiter evidence queue responses', () => isolated(async () => {
  setWorkspaceIdentity({ address, chainId: 31337 });
  let release!: (response: Response) => void;
  globalThis.fetch = () => new Promise<Response>(r => { release = r; });
  const pending = workspaceRequest('/arbiter/disputes');
  setWorkspaceIdentity(null); release(Response.json({ disputes: [], next_cursor: null }));
  await assert.rejects(pending, { name: 'AbortError' });
}));
