import { BodyTooLarge, readBoundedBody } from '../../../lib/bounded-body.ts';
import { isCheckResponse } from '../../../lib/check-response.ts';

export const runtime = 'nodejs';
const LIMIT = 128 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const error = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

export async function POST(request: Request): Promise<Response> {
  // Stateless, credential-free endpoint. Fetch Metadata blocks browser cross-site
  // requests; JSON Content-Type is additionally required. Do not compare against
  // request.url: Next may reconstruct its origin using an internal hostname.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return error(403, 'ORIGIN_REJECTED', 'Use the checker from this application.');
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return error(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request.');
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > LIMIT)) return error(413, 'BODY_TOO_LARGE', 'Request exceeds the 128 KiB limit.');
  let body: string;
  try {
    body = await readBoundedBody(request.body, LIMIT);
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return error(400, 'INVALID_INPUT', 'Send a JSON checker object.');
  } catch (cause) {
    return cause instanceof BodyTooLarge ? error(413, 'BODY_TOO_LARGE', 'Request exceeds the 128 KiB limit.') : error(400, 'INVALID_INPUT', 'Request must contain valid UTF-8 JSON.');
  }
  try {
    // This environment variable is used only in this server route. Never accept a client URL.
    const base = new URL(process.env.GO_API_URL || 'http://127.0.0.1:8080');
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid server configuration');
    const endpoint = new URL('/api/v1/check', base.origin);
    const upstream = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body, signal: AbortSignal.timeout(10000), redirect: 'error', credentials: 'omit', cache: 'no-store',
    });
    if (upstream.status !== 200) {
      await upstream.body?.cancel();
      if (upstream.status === 400) return error(400, 'INVALID_INPUT', 'The checker rejected this input. Check duplicate keys, field limits, and rule values.');
      if (upstream.status === 413) return error(413, 'BODY_TOO_LARGE', 'Request exceeds the checker limit.');
      return error(502, 'CHECKER_UNAVAILABLE', 'The checker is unavailable. Try again shortly.');
    }
    if (upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      await upstream.body?.cancel();
      return error(502, 'INVALID_RESPONSE', 'The checker returned an invalid response.');
    }
    let result: unknown;
    try { result = JSON.parse(await readBoundedBody(upstream.body, 2 * 1024 * 1024)); }
    catch (cause) { if (cause instanceof Error && cause.name === 'TimeoutError') throw cause; return error(502, 'INVALID_RESPONSE', 'The checker returned an invalid response.'); }
    if (!isCheckResponse(result)) return error(502, 'INVALID_RESPONSE', 'The checker returned an invalid response.');
    // Reconstruct the documented shape; never relay extra upstream fields.
    return json({ checker_version: result.checker_version, passed: result.passed, checks: result.checks.map(({ id, key, status, message }) => ({ id, key, status, message })), ai_review: { status: result.ai_review.status, message: result.ai_review.message } });
  } catch (cause) {
    if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) return error(504, 'CHECKER_TIMEOUT', 'The checker timed out. Please try again.');
    return error(502, 'CHECKER_UNAVAILABLE', 'The checker is unavailable. Confirm the local service is running.');
  }
}
