import { parseTask } from './workspace-types.ts';
let identity: { address: string; chainId: number } | null = null;
export function setWorkspaceIdentity(next: typeof identity) { identity = next; }
export class WorkspaceError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = 'WorkspaceError'; this.status = status; }
}
export async function workspaceRequest<Result>(path: string, init: RequestInit = {}): Promise<Result> {
  if (!/^\/(?:me|auth\/(?:challenge|verify|logout)|tasks(?:\/[a-f0-9-]+(?:\/(?:accept|cancel))?)?)$/i.test(path)) throw new WorkspaceError('Unknown workspace action.', 400);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  const expected = identity;
  if (expected) { headers.set('X-Pactra-Address', expected.address); headers.set('X-Pactra-Chain', String(expected.chainId)); }
  let response: Response;
  try { response = await fetch('/api/workspace' + path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' }); }
  catch (error) { if (error instanceof Error && error.name === 'AbortError') throw error; throw new WorkspaceError('Connection interrupted. The result may be uncertain. Check the task before trying again.', 0); }
  if (path.startsWith('/tasks') && (expected !== identity || init.signal?.aborted)) throw new DOMException('Stale workspace response.', 'AbortError');
  if (response.status === 204) return undefined as Result;
  let result: unknown;
  try { result = await response.json(); } catch { throw new WorkspaceError('The workspace returned an invalid response.', 502); }
  if (path.startsWith('/tasks') && (expected !== identity || init.signal?.aborted)) throw new DOMException('Stale workspace response.', 'AbortError');
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'object' && result.error && 'message' in result.error && typeof result.error.message === 'string' ? result.error.message : 'This workspace action could not be completed.';
    if (response.status === 401 && path.startsWith('/tasks') && typeof window !== 'undefined') window.dispatchEvent(new Event('pactra:session-expired'));
    throw new WorkspaceError(message, response.status);
  }
  if (path.startsWith('/tasks')) {
    if (expected !== identity) throw new WorkspaceError('Wallet changed. This response was discarded.', 401);
    if (path === '/tasks' && (!init.method || init.method === 'GET')) {
      if (!result || typeof result !== 'object' || !('tasks' in result) || !Array.isArray(result.tasks)) throw new WorkspaceError('Invalid task list.', 502);
      return { tasks: result.tasks.map(parseTask) } as Result;
    }
    return parseTask(result) as Result;
  }
  return result as Result;
}
