import { parseTask, uuidPattern, type Task } from './workspace-types.ts';
import { parseSettlementResponse } from './onchain-types.ts';
import { parseAdvisoryReview, parseTaskPage, workspaceQuery, workspaceRoute, type TaskPage } from './workspace-path.ts';
import { parseCriteriaDraftResponse } from './criteria.ts';
let identity: { address: string; chainId: number } | null = null;
const identityCleanups = new Set<() => void>();
export function onWorkspaceIdentityChange(cleanup: () => void) {
  identityCleanups.add(cleanup);
  return () => { identityCleanups.delete(cleanup); };
}
export function setWorkspaceIdentity(next: typeof identity) {
  if (identity === next) return;
  identity = next ? { ...next } : null;
  for (const cleanup of [...identityCleanups]) cleanup();
}
export class WorkspaceError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = 'WorkspaceError'; this.status = status; }
}
export async function workspaceRequest<Result>(path: string, init: RequestInit = {}): Promise<Result> {
  const separator = path.indexOf('?');
  const pathname = separator < 0 ? path : path.slice(0, separator);
  const route = workspaceRoute(pathname);
  const method = init.method || 'GET';
  if (!route) throw new WorkspaceError('Unknown workspace action.', 400);
  if (!route.methods.includes(method)) throw new WorkspaceError('Method not allowed.', 405);
  let query: string;
  try { query = workspaceQuery(route, method, separator < 0 ? '' : path.slice(separator)); }
  catch { throw new WorkspaceError('Invalid workspace query.', 400); }
  const headers = new Headers(init.headers);
  const key = headers.get('idempotency-key');
  if (key !== null && (route.kind !== 'tasks' || method !== 'POST' || !uuidPattern.test(key))) throw new WorkspaceError('Invalid idempotency key.', 400);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  const expected = identity;
  if (expected) { headers.set('X-Pactra-Address', expected.address); headers.set('X-Pactra-Chain', String(expected.chainId)); }
  const privateAction = route.kind !== 'auth';
  const stale = () => { if (privateAction && (expected !== identity || init.signal?.aborted)) throw new DOMException('Stale workspace response.', 'AbortError'); };
  stale();
  let response: Response;
  try { response = await fetch('/api/workspace' + pathname + query, { ...init, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error' }); }
  catch (error) { stale(); if (error instanceof Error && error.name === 'AbortError') throw error; throw new WorkspaceError('Connection interrupted. The result may be uncertain. Check the task before trying again.', 0); }
  stale();
  if (response.status === 204 && pathname === '/auth/logout') return undefined as Result;
  let result: unknown;
  try { result = await response.json(); } catch { stale(); throw new WorkspaceError('The workspace returned an invalid response.', 502); }
  stale();
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'object' && result.error && 'message' in result.error && typeof result.error.message === 'string' ? result.error.message : 'This workspace action could not be completed.';
    if (response.status === 401 && privateAction && typeof window !== 'undefined') window.dispatchEvent(new Event('pactra:session-expired'));
    throw new WorkspaceError(message, response.status);
  }
  try {
    if (route.kind === 'settlement' || route.kind === 'arbiterQueue') return parseSettlementResponse(pathname, result) as Result;
    if (route.kind === 'tasks' && method === 'GET') return parseTaskPage(result) as Result;
    if (route.kind === 'delivery') {
      const { parseDeliveryHistory, parseDeliveryMutation } = await import('./delivery-types.ts');
      stale();
      const delivery = method === 'GET' ? parseDeliveryHistory(result) : parseDeliveryMutation(result);
      const segments = pathname.slice(1).split('/');
      if (delivery.task_id.toLowerCase() !== segments[1].toLowerCase() || delivery.deliverable_id !== segments[3]) throw new Error('Mismatched delivery response.');
      return delivery as Result;
    }
    if (route.kind === 'review') {
      if (typeof init.body !== 'string') throw new Error('Missing review input.');
      return parseAdvisoryReview(result, JSON.parse(init.body)) as Result;
    }
    if (route.kind === 'criteriaDraft') {
      if (typeof init.body !== 'string') throw new Error('Missing criteria draft input.');
      return parseCriteriaDraftResponse(result) as Result;
    }
    if (pathname.startsWith('/tasks')) return parseTask(result) as Result;
    return result as Result;
  } catch (error) { stale(); if (error instanceof WorkspaceError) throw error; throw new WorkspaceError('The workspace returned an invalid response.', 502); }
}

export type TaskAttemptState = 'ready' | 'pending' | 'uncertain' | 'resolved' | 'rejected' | 'disposed';
export function createTaskAttempt(rawBody: string) {
  const expected = identity;
  let body = rawBody, key = crypto.randomUUID();
  let state: TaskAttemptState = 'ready';
  let active: AbortController | null = null;
  const dispose = () => { state = 'disposed'; body = ''; key = ''; active?.abort(); identityCleanups.delete(dispose); };
  identityCleanups.add(dispose);
  return {
    get state() { return state; },
    dispose,
    async send(signal?: AbortSignal): Promise<Task> {
      if (expected !== identity || state === 'disposed') { dispose(); throw new DOMException('Wallet changed.', 'AbortError'); }
      if (!['ready', 'uncertain'].includes(state)) throw new WorkspaceError('This creation attempt cannot be sent again.', 409);
      const wasUncertain = state === 'uncertain';
      state = 'pending'; active = new AbortController();
      try {
        const task = await workspaceRequest<Task>('/tasks', { method: 'POST', body, headers: { 'Idempotency-Key': key }, signal: AbortSignal.any([active.signal, AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) });
        state = 'resolved'; body = ''; key = ''; identityCleanups.delete(dispose);
        return task;
      } catch (error) {
        if (expected !== identity || active.signal.aborted) { dispose(); throw new DOMException('Creation attempt discarded.', 'AbortError'); }
        const status = error instanceof WorkspaceError ? error.status : 0;
        // A later rejection cannot prove an earlier ambiguous request was not committed.
        if (status === 401) dispose();
        else if (wasUncertain || status === 0 || status >= 500 || status === 408 || status === 409) state = 'uncertain';
        else { state = 'rejected'; body = ''; key = ''; identityCleanups.delete(dispose); }
        throw error;
      } finally { active = null; }
    },
  };
}

export type TaskPagerSnapshot = { data: TaskPage | null; error: unknown; loading: boolean; loadingMore: boolean };
export function createTaskPager(changed: () => void) {
  let snapshot: TaskPagerSnapshot = { data: null, error: null, loading: true, loadingMore: false };
  let active: AbortController | null = null;
  let disposed = false;
  const cursors = new Set<string>();
  const publish = (next: TaskPagerSnapshot) => { snapshot = next; changed(); };
  const dispose = () => { disposed = true; active?.abort(); snapshot = { data: null, error: null, loading: false, loadingMore: false }; cursors.clear(); identityCleanups.delete(clearIdentity); };
  const clearIdentity = () => { dispose(); changed(); };
  identityCleanups.add(clearIdentity);
  async function load(more: boolean) {
    if (disposed || (more && (snapshot.loading || !snapshot.data?.next_cursor))) return;
    const cursor = more ? snapshot.data!.next_cursor : null;
    active?.abort(); const controller = new AbortController(); active = controller;
    publish({ ...snapshot, error: null, loading: true, loadingMore: more });
    try {
      const page = await workspaceRequest<TaskPage>('/tasks?limit=50' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (disposed || controller.signal.aborted || active !== controller) return;
      if (!more) cursors.clear();
      if (cursor) cursors.add(cursor);
      if (page.next_cursor && cursors.has(page.next_cursor)) throw new WorkspaceError('The workspace returned a repeated page cursor. Refresh the list.', 502);
      const tasks = [...new Map([...(more ? snapshot.data?.tasks ?? [] : []), ...page.tasks].map(task => [task.id, task])).values()];
      publish({ data: { tasks, next_cursor: page.next_cursor ?? null }, error: null, loading: false, loadingMore: false });
    } catch (error) {
      if (disposed || controller.signal.aborted || active !== controller) return;
      const forbidden = error instanceof WorkspaceError && [401, 403, 404].includes(error.status);
      publish({ ...snapshot, data: forbidden ? null : snapshot.data, error, loading: false, loadingMore: false });
    }
  }
  return { get snapshot() { return snapshot; }, reload: () => load(false), loadMore: () => load(true), dispose };
}
