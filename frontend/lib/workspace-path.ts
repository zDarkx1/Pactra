import { parseTask, uuidPattern, type Task } from './workspace-types.ts';

export type WorkspaceRoute = { path: string; kind: 'auth' | 'me' | 'tasks' | 'task' | 'taskMutation' | 'delivery' | 'review' | 'settlement' | 'arbiterQueue'; methods: readonly string[] };
export function workspaceRoute(path: string): WorkspaceRoute | null {
  // Validate before URL parsing: no decoding, normalization, alternate targets or traversal.
  if (!path.startsWith('/') || /[%\\?#\s]/.test(path)) return null;
  const segments = path.slice(1).split('/');
  if (path === '/onchain/config') return { path, kind: 'settlement', methods: ['GET'] };
  if (path === '/arbiter/disputes') return { path, kind: 'arbiterQueue', methods: ['GET'] };
  if (segments.length === 6 && segments[0] === 'arbiter' && segments[1] === 'tasks' && uuidPattern.test(segments[2]) && segments[3] === 'deliverables' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segments[4]) && segments[4].length <= 64 && segments[5] === 'evidence') return { path, kind: 'settlement', methods: ['GET'] };
  if (path === '/me') return { path, kind: 'me', methods: ['GET'] };
  if (path === '/review') return { path, kind: 'review', methods: ['POST'] };
  if (/^\/auth\/(challenge|verify|logout)$/.test(path)) return { path, kind: 'auth', methods: ['POST'] };
  if (path === '/tasks') return { path, kind: 'tasks', methods: ['GET', 'POST'] };
  if (segments[0] !== 'tasks' || !uuidPattern.test(segments[1] || '')) return null;
  if (segments.length === 2) return { path, kind: 'task', methods: ['GET'] };
  if (segments.length === 3 && segments[2] === 'onchain') return { path, kind: 'settlement', methods: ['GET'] };
  if (segments.length === 4 && segments[2] === 'onchain' && segments[3] === 'reconcile') return { path, kind: 'settlement', methods: ['POST'] };
  if (segments.length === 6 && segments[2] === 'deliverables' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segments[3]) && segments[3].length <= 64 && segments[4] === 'onchain' && segments[5] === 'availability') return { path, kind: 'settlement', methods: ['POST'] };
  if (segments.length === 3 && ['accept', 'cancel'].includes(segments[2])) return { path, kind: 'taskMutation', methods: ['POST'] };
  if (segments.length === 5 && segments[2] === 'deliverables' && segments[3].length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segments[3]) && ['submissions', 'reviews', 'disputes'].includes(segments[4])) {
    return { path, kind: 'delivery', methods: segments[4] === 'submissions' ? ['GET', 'POST'] : ['POST'] };
  }
  return null;
}

// Opaque cursor: bounded printable token, never interpreted as a URL or decoded twice.
export function validCursor(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && /^[\x21-\x7e]+$/.test(value);
}
export function workspaceQuery(route: WorkspaceRoute, method: string, search: string): string {
  if (!search) return '';
  if (!['tasks', 'arbiterQueue'].includes(route.kind) || method !== 'GET' || search.length > 4096 || /[#\\\s]|%(?![0-9a-f]{2})/i.test(search)
    || !/^\?[^&]+(?:&[^&]+)*$/.test(search)) throw new Error('Invalid query.');
  const params = new URLSearchParams(search);
  if (!params.size || [...params.keys()].some(key => !['limit', 'cursor'].includes(key) || params.getAll(key).length !== 1)) throw new Error('Invalid query.');
  const limit = params.get('limit'), cursor = params.get('cursor');
  if (limit !== null && (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit))) throw new Error('Invalid limit.');
  if (cursor !== null && !validCursor(cursor)) throw new Error('Invalid cursor.');
  return '?' + params.toString();
}
export type TaskPage = { tasks: Task[]; next_cursor?: string | null };
export function parseTaskPage(value: unknown): TaskPage {
  if (!value || typeof value !== 'object' || !('tasks' in value) || !Array.isArray(value.tasks) || value.tasks.length > 50) throw new Error('Invalid task list.');
  const tasks = value.tasks.map(parseTask);
  if (!('next_cursor' in value)) return { tasks }; // Older backend, no pagination advertised.
  if (value.next_cursor !== null && !validCursor(value.next_cursor)) throw new Error('Invalid next cursor.');
  return { tasks, next_cursor: value.next_cursor };
}

export type AdvisoryReview = { status: 'completed'; advisory: true; findings: { key: string; assessment: 'supported' | 'concern' | 'uncertain'; source_excerpt: string; submission_excerpt: string; explanation: string }[] };
export function parseAdvisoryReview(value: unknown, input: Record<string, unknown>): AdvisoryReview {
  const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const source = input.source, submission = input.submission;
  if (!isObject(source) || !isObject(submission) || !Object.values(source).every(v => typeof v === 'string') || !Object.values(submission).every(v => typeof v === 'string')) throw new Error('Invalid review input.');
  const keys = Object.keys(source).filter(key => Object.hasOwn(submission, key));
  if (!isObject(value) || value.status !== 'completed' || value.advisory !== true || !Array.isArray(value.findings) || !keys.length || keys.length > 20 || value.findings.length !== keys.length
    || Object.keys(value).some(key => !['status', 'advisory', 'findings', 'provider', 'model'].includes(key))
    || ['provider', 'model'].some(key => key in value && typeof value[key] !== 'string')) throw new Error('Invalid advisory review.');
  const seen = new Set<string>();
  const findings = value.findings.map(finding => {
    if (!isObject(finding) || Object.keys(finding).length !== 5 || typeof finding.key !== 'string' || !keys.includes(finding.key) || seen.has(finding.key)
      || !['supported', 'concern', 'uncertain'].includes(String(finding.assessment)) || typeof finding.assessment !== 'string'
      || finding.source_excerpt !== source[finding.key] || finding.submission_excerpt !== submission[finding.key]
      || typeof finding.explanation !== 'string' || !finding.explanation.trim() || new TextEncoder().encode(finding.explanation).length > 2000) throw new Error('Invalid advisory finding.');
    seen.add(finding.key);
    return { key: finding.key, assessment: finding.assessment as AdvisoryReview['findings'][number]['assessment'], source_excerpt: finding.source_excerpt as string, submission_excerpt: finding.submission_excerpt as string, explanation: finding.explanation };
  });
  return { status: 'completed', advisory: true, findings };
}
