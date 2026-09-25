import { parseSiweMessage } from 'viem/siwe';
import { parseSettlementResponse } from './onchain-types.ts';
import { BodyTooLarge, readBoundedBody } from './bounded-body.ts';
import { appOrigin, getPublicWorkspaceConfig } from './workspace-config.ts';
import { parseTask, uuidPattern, walletAddressPattern } from './workspace-types.ts';
import { parseAdvisoryReview, parseTaskPage, workspaceQuery, workspaceRoute } from './workspace-path.ts';

const sessionCookie = 'pactra_session';
const challengeCookie = 'pactra_challenge';
const privateHeaders = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: privateHeaders });
function cookie(request: Request, name: string) {
  const parts = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
  if (parts.length !== 1) return '';
  try { return decodeURIComponent(parts[0].slice(name.length + 1)); } catch { return ''; }
}
function setCookie(response: Response, name: string, value: string, maxAge: number) {
  response.headers.append('Set-Cookie', name + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (appOrigin().protocol === 'https:' ? '; Secure' : ''));
}
function failure(status: number, message?: string) {
  const messages: Record<number, string> = {
    400: 'Check the submitted fields and their limits.', 401: 'Your session has expired. Sign in again.',
    403: 'This action is not available for this account or origin.', 404: 'This task is unavailable or you do not have access.',
    409: 'The task changed. Reload its current state before taking action.', 413: 'This request exceeds the workspace size limit.',
    415: 'Send application/json.', 429: 'Too many attempts. Wait before trying again.',
    502: 'The workspace is unavailable. The result may be uncertain; check the task before retrying.',
    503: 'The workspace or team arbiters are not configured yet.',
    504: 'The workspace timed out. Check the task before trying this action again.',
  };
  const response = json({ error: { code: 'WORKSPACE_' + status, message: message || messages[status] || messages[502] } }, status);
  return response;
}
async function upstream(path: string, method: string, token: string, body?: string, idempotencyKey?: string) {
  const rawOrigin = process.env.GO_API_URL || 'http://127.0.0.1:8080';
  const base = new URL(rawOrigin);
  const numericLoopback = /^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/.test(rawOrigin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
    || (process.env.NODE_ENV === 'production' && base.protocol !== 'https:' && !numericLoopback)) throw new Error('Invalid Go origin.');
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', 'Bearer ' + token);
  if (idempotencyKey !== undefined) headers.set('Idempotency-Key', idempotencyKey);
  return fetch(new URL('/api/v1/' + path, base.origin), { method, headers, body, signal: AbortSignal.timeout(path === 'review' || path.includes('/onchain') || path.startsWith('onchain/') || path.startsWith('arbiter/') ? 35000 : 10000), redirect: 'error', cache: 'no-store', credentials: 'omit' });
}
async function data(response: Response, limit = 4 * 1024 * 1024): Promise<unknown> {
  if (response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Error('Invalid response content type.');
  return JSON.parse(await readBoundedBody(response.body, limit));
}
function memberAddress(value: unknown) {
  if (!value || typeof value !== 'object' || !('address' in value) || typeof value.address !== 'string' || !walletAddressPattern.test(value.address)) throw new Error('Invalid account.');
  return value.address.toLowerCase();
}
async function forwardFailure(response: Response) {
  await response.body?.cancel();
  return failure([400, 401, 403, 404, 409, 413, 415, 429, 503, 504].includes(response.status) ? response.status : 502);
}
export async function handleWorkspaceRequest(request: Request, segments: string[]): Promise<Response> {
  let origin: URL;
  try { origin = appOrigin(); } catch { return json({ error: { code: 'WORKSPACE_CONFIG', message: 'Workspace origin is not configured.' } }, 503); }
  const path = segments.join('/');
  const route = workspaceRoute('/' + path);
  if (!route || segments.some(segment => segment.includes('/') || segment.includes('..'))) return failure(404);
  const read = request.method === 'GET';
  if (!route.methods.includes(request.method)) {
    return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, 405);
  }
  if (request.headers.get('sec-fetch-site') === 'cross-site') return failure(403);
  if (!read && request.headers.get('origin') !== origin.origin) return failure(403);
  if (route.kind === 'review' && process.env.PACTRA_PUBLIC_AI_ENABLED !== 'true') return failure(503, 'AI review is disabled. Deterministic checks remain available.');
  let query: string;
  try { query = workspaceQuery(route, request.method, new URL(request.url).search); } catch { return failure(400); }
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey !== null && (path !== 'tasks' || read || !uuidPattern.test(idempotencyKey))) return failure(400);
  const config = getPublicWorkspaceConfig();
  if (!config.enabled || !config.chain) return failure(503, config.reason || undefined);
  let body: string | undefined;
  let input: Record<string, unknown> = {};
  if (!read) {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return failure(415);
    try {
      body = await readBoundedBody(request.body, (route.kind === 'review' ? 16 : 64) * 1024);
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return failure(400);
      input = parsed as Record<string, unknown>;
    } catch (error) { return failure(error instanceof BodyTooLarge ? 413 : 400); }
  }
  const token = cookie(request, sessionCookie);
  const publicAction = path === 'auth/challenge' || path === 'auth/verify';
  if (path === 'auth/logout' && !/^[a-f0-9]{64}$/.test(token)) {
    const result = new Response(null, { status: 204, headers: privateHeaders });
    setCookie(result, sessionCookie, '', 0);
    setCookie(result, challengeCookie, '', 0);
    return result;
  }
  if (!publicAction && !/^[a-f0-9]{64}$/.test(token)) return failure(401);
  try {
    if (path === 'auth/challenge') {
      if (typeof input.address !== 'string' || !walletAddressPattern.test(input.address)) return failure(400);
      const response = await upstream(path, 'POST', '', body);
      if (response.status !== 201) return forwardFailure(response);
      const value = await data(response) as { challenge_id: string; message: string; expires_at: string };
      if (!value || !uuidPattern.test(value.challenge_id) || typeof value.message !== 'string' || typeof value.expires_at !== 'string') throw new Error('Invalid challenge.');
      const parsed = parseSiweMessage(value.message);
      if (parsed.domain !== origin.host || parsed.uri !== origin.origin || parsed.chainId !== config.chain.id
        || parsed.address?.toLowerCase() !== input.address.toLowerCase() || parsed.version !== '1'
        || !Number.isFinite(Date.parse(value.expires_at)) || Date.parse(value.expires_at) <= Date.now()) return failure(503, 'Wallet sign-in configuration does not match this site. Ask the team to check domain, URI, and chain.');
      const result = json({ challenge_id: value.challenge_id, message: value.message, expires_at: value.expires_at }, 201);
      setCookie(result, challengeCookie, value.challenge_id + '.' + input.address.toLowerCase(), 300);
      return result;
    }
    if (path === 'auth/verify') {
      const [challengeId, expectedAddress] = cookie(request, challengeCookie).split('.');
      if (!uuidPattern.test(challengeId || '') || !walletAddressPattern.test(expectedAddress || '') || input.challenge_id !== challengeId) return failure(401);
      const response = await upstream(path, 'POST', '', body);
      if (response.status !== 200) return forwardFailure(response);
      const value = await data(response) as { token: string; token_type: string; expires_at: string; address: string };
      const address = memberAddress(value);
      const maxAge = Math.min(86400, Math.floor((Date.parse(value.expires_at) - Date.now()) / 1000));
      if (!/^[a-f0-9]{64}$/.test(value.token) || value.token_type !== 'Bearer' || address !== expectedAddress || !Number.isFinite(maxAge) || maxAge <= 0) throw new Error('Invalid session.');
      const result = json({ address, expires_at: value.expires_at });
      setCookie(result, sessionCookie, value.token, maxAge);
      setCookie(result, challengeCookie, '', 0);
      return result;
    }
    if (path === 'auth/logout') {
      const response = await upstream(path, 'POST', token, body);
      if (![204, 401].includes(response.status)) return forwardFailure(response);
      await response.body?.cancel();
      const result = new Response(null, { status: 204, headers: privateHeaders });
      setCookie(result, sessionCookie, '', 0);
      setCookie(result, challengeCookie, '', 0);
      return result;
    }
    const me = await upstream('me', 'GET', token);
    if (me.status !== 200) return forwardFailure(me);
    const address = memberAddress(await data(me));
    const expectedAddress = request.headers.get('x-pactra-address');
    const expectedChain = request.headers.get('x-pactra-chain');
    if (!expectedAddress || !walletAddressPattern.test(expectedAddress) || expectedAddress.toLowerCase() !== address || expectedChain !== String(config.chain.id)) return failure(401, 'Wallet and session do not match. Sign in with the selected account.');
    if (path === 'me') return json({ address });
    const response = await upstream(path + query, request.method, token, body, idempotencyKey ?? undefined);
    if (![200, 201].includes(response.status)) return forwardFailure(response);
    const value = await data(response, route.kind === 'review' ? 256 * 1024 : undefined);
    if (route.kind === 'settlement' || route.kind === 'arbiterQueue') return json(parseSettlementResponse('/' + path, value), response.status);
    if (path === 'tasks' && read) {
      return json(parseTaskPage(value));
    }
    if (route.kind === 'delivery') {
      const { parseDeliveryHistory, parseDeliveryMutation } = await import('./delivery-types.ts');
      const delivery = read ? parseDeliveryHistory(value) : parseDeliveryMutation(value);
      if (delivery.task_id.toLowerCase() !== segments[1].toLowerCase() || delivery.deliverable_id !== segments[3]) throw new Error('Mismatched delivery response.');
      return json(delivery, response.status);
    }
    if (route.kind === 'review') return json(parseAdvisoryReview(value, input));
    return json(parseTask(value), response.status);
  } catch (error) {
    return failure(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 504 : 502);
  }
}
