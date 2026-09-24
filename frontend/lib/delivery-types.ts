// Contract: docs/DELIVERY_API.md, workspace/delivery.go and backend/handler.go.
// No storage, logging, browser hash normalization, or source projection.
export type DeliveryState = 'not_submitted' | 'submitted' | 'revision_requested' | 'accepted' | 'disputed';
export type DeliveryAction = 'submit' | 'accept' | 'request_revision' | 'dispute';
export type DeliveryCheckOutput = {
  checker_version: 'localization-v1'; passed: boolean;
  checks: { id: 'key_parity' | 'nonempty'; key: string; status: 'pass' | 'fail'; message: string }[];
  ai_review: { status: 'not_configured'; message: string };
} | { error: { code: 'invalid_request' | 'request_too_large' | 'unsupported_media_type' | 'not_found' | 'method_not_allowed'; message: string } };
export type DeliveryChecker = {
  policy: 'default_metadata_only'; rules: { preserve_placeholders: false; required_terms: [] };
  http_status: number; output: DeliveryCheckOutput;
};
export type DeliveryEvent = { version: number; actor: string; artifact_hash: string; manifest_hash: string; notes: string; created_at: string };
export type DeliverySubmission = DeliveryEvent & { artifact: Record<string, string>; checker: DeliveryChecker };
export type DeliveryReviewEvent = DeliveryEvent & { decision: 'accept' | 'request_revision' };
export type DeliveryDispute = DeliveryEvent & { evidence_flag: true };
export type DeliveryHistory = {
  task_id: string; deliverable_id: string; task_status: 'accepted_unfunded'; unfunded_review: true;
  manifest_hash: string; state: DeliveryState; latest_version: number; latest_artifact_hash: string;
  revision_limit: number; submissions: DeliverySubmission[]; reviews: DeliveryReviewEvent[]; disputes: DeliveryDispute[];
};
export type DeliveryMutation = DeliveryHistory;
export type DeliveryIntent = Readonly<{ path: string; body: string; action: DeliveryAction; version: number; artifactHash: string }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
const address = /^0x[0-9a-fA-F]{40}$/;
const encoder = new TextEncoder();
function invalid(): never { throw new Error('Invalid delivery response or intent.'); }
function object(v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return invalid();
  return v as Record<string, unknown>;
}
function fields(v: unknown, keys: string[]): Record<string, unknown> {
  const o = object(v);
  if (Object.keys(o).length !== keys.length || keys.some(k => !Object.hasOwn(o, k))) return invalid();
  return o;
}
function text(v: unknown, max: number, min = 0): string {
  if (typeof v !== 'string' || v.length > max * 2 || [...v].length > max || [...v].length < min || /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)) return invalid();
  return v;
}
function pattern(v: unknown, re: RegExp, max: number): string {
  const s = text(v, max, max === 64 && re === hash ? 64 : 1);
  if (!re.test(s) || s.endsWith('\n') || s.endsWith('\r')) return invalid();
  return s;
}
function integer(v: unknown, max: number, min = 0): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) return invalid();
  return v;
}
function choice<T extends string>(v: unknown, choices: readonly T[]): T {
  if (typeof v !== 'string' || !choices.includes(v as T)) return invalid();
  return v as T;
}
function array(v: unknown, max: number): unknown[] { if (!Array.isArray(v) || v.length > max) return invalid(); return v; }
function artifact(v: unknown): Record<string, string> {
  const entries = Object.entries(object(v));
  if (entries.length > 100) return invalid();
  const result = Object.fromEntries(entries.map(([k, value]) => {
    // Match Go strings.TrimSpace's Unicode White_Space set, not JS trim():
    // U+0085 is whitespace; U+FEFF is not. Validate without changing the key.
    if (!/[^\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u.test(text(k, 160, 1))) return invalid();
    return [k, text(value, 16384)];
  }));
  // JSON.stringify's minimal representation cannot exceed the original allowed
  // raw JSON size. Go's HTML escapes disappear when the response is decoded.
  if (encoder.encode(JSON.stringify(result)).length > 16384) return invalid();
  return result;
}
function checker(v: unknown): DeliveryChecker {
  const c = fields(v, ['policy', 'rules', 'http_status', 'output']);
  if (c.policy !== 'default_metadata_only') return invalid();
  const rules = fields(c.rules, ['preserve_placeholders', 'required_terms']);
  if (rules.preserve_placeholders !== false || array(rules.required_terms, 0).length !== 0) return invalid();
  const status = integer(c.http_status, 499, 200);
  let output: DeliveryCheckOutput;
  if (status === 200) {
    const o = fields(c.output, ['checker_version', 'passed', 'checks', 'ai_review']);
    if (o.checker_version !== 'localization-v1' || typeof o.passed !== 'boolean') return invalid();
    const checks = array(o.checks, 300).map(value => {
      const check = fields(value, ['id', 'key', 'status', 'message']);
      return { id: choice(check.id, ['key_parity', 'nonempty']), key: text(check.key, 200), status: choice(check.status, ['pass', 'fail']), message: text(check.message, 2000, 1) };
    });
    if (!checks.length || o.passed !== checks.every(c => c.status === 'pass')) return invalid();
    const ai = fields(o.ai_review, ['status', 'message']);
    if (ai.status !== 'not_configured') return invalid();
    output = { checker_version: 'localization-v1', passed: o.passed, checks, ai_review: { status: 'not_configured', message: text(ai.message, 2000, 1) } };
  } else {
    if (![400, 404, 405, 413, 415].includes(status)) return invalid();
    const e = fields(fields(c.output, ['error']).error, ['code', 'message']);
    const code = choice(e.code, ['invalid_request', 'request_too_large', 'unsupported_media_type', 'not_found', 'method_not_allowed']);
    const codes = { invalid_request: 400, request_too_large: 413, unsupported_media_type: 415, not_found: 404, method_not_allowed: 405 };
    if (codes[code] !== status) return invalid();
    output = { error: { code, message: text(e.message, 2000, 1) } };
  }
  return { policy: 'default_metadata_only', rules: { preserve_placeholders: false, required_terms: [] }, http_status: status, output };
}
const eventFields = ['version', 'actor', 'artifact_hash', 'manifest_hash', 'notes', 'created_at'];
function event(o: Record<string, unknown>): DeliveryEvent {
  const created_at = text(o.created_at, 40, 20);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(created_at) || !Number.isFinite(Date.parse(created_at))) return invalid();
  return { version: integer(o.version, 6, 1), actor: pattern(o.actor, address, 42), artifact_hash: pattern(o.artifact_hash, hash, 64),
    manifest_hash: pattern(o.manifest_hash, hash, 64), notes: text(o.notes, 2000), created_at };
}
export function parseDeliveryHistory(value: unknown): DeliveryHistory {
  const o = fields(value, ['task_id', 'deliverable_id', 'task_status', 'unfunded_review', 'manifest_hash', 'state', 'latest_version', 'latest_artifact_hash', 'revision_limit', 'submissions', 'reviews', 'disputes']);
  if (o.task_status !== 'accepted_unfunded' || o.unfunded_review !== true) return invalid();
  const result: DeliveryHistory = {
    task_id: pattern(o.task_id, uuid, 36), deliverable_id: pattern(o.deliverable_id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 64),
    task_status: 'accepted_unfunded', unfunded_review: true, manifest_hash: pattern(o.manifest_hash, hash, 64),
    state: choice(o.state, ['not_submitted', 'submitted', 'revision_requested', 'accepted', 'disputed']),
    latest_version: integer(o.latest_version, 6), latest_artifact_hash: o.latest_artifact_hash === '' ? '' : pattern(o.latest_artifact_hash, hash, 64),
    revision_limit: integer(o.revision_limit, 5),
    submissions: array(o.submissions, 6).map(v => { const s = fields(v, [...eventFields, 'artifact', 'checker']); return { ...event(s), artifact: artifact(s.artifact), checker: checker(s.checker) }; }),
    reviews: array(o.reviews, 6).map(v => { const r = fields(v, [...eventFields, 'decision']); return { ...event(r), decision: choice(r.decision, ['accept', 'request_revision']) }; }),
    disputes: array(o.disputes, 1).map(v => { const d = fields(v, [...eventFields, 'evidence_flag']); if (d.evidence_flag !== true) return invalid(); return { ...event(d), evidence_flag: true }; }),
  };
  if (result.latest_version !== result.submissions.length || result.submissions.length > result.revision_limit + 1 || result.latest_artifact_hash !== (result.submissions.at(-1)?.artifact_hash ?? '')) return invalid();
  for (const events of [result.reviews, result.disputes]) {
    let previous = 0;
    for (const e of events) {
      const s = result.submissions[e.version - 1];
      if (!s || e.version <= previous || e.artifact_hash !== s.artifact_hash || e.manifest_hash !== result.manifest_hash) return invalid();
      previous = e.version;
    }
  }
  let state: DeliveryState = 'not_submitted';
  for (const [i, s] of result.submissions.entries()) {
    if (s.version !== i + 1 || s.manifest_hash !== result.manifest_hash || (i > 0 && state !== 'revision_requested')) return invalid();
    state = 'submitted';
    const review = result.reviews.find(r => r.version === s.version);
    if (review) {
      if (review.decision === 'request_revision' && s.version > result.revision_limit) return invalid();
      state = review.decision === 'accept' ? 'accepted' : 'revision_requested';
    }
    if (result.disputes.some(d => d.version === s.version)) { if (state === 'accepted') return invalid(); state = 'disputed'; }
  }
  if (state !== result.state) return invalid();
  return result;
}
export function parseDeliveryMutation(value: unknown): DeliveryMutation { return parseDeliveryHistory(value); }
export function deliveryRevisionsRemaining(history: DeliveryHistory): number { return Math.max(0, history.revision_limit - Math.max(0, history.latest_version - 1)); }
export function buildDeliveryIntent(history: DeliveryHistory, action: DeliveryAction, notes: string, rawArtifact: string, acknowledged: boolean, key: string): DeliveryIntent {
  if (acknowledged !== true) throw new Error('Confirm that this is voluntary unfunded review before continuing.');
  pattern(key, uuid, 36); text(notes, 2000);
  const canSubmit = history.state === 'not_submitted' || (history.state === 'revision_requested' && deliveryRevisionsRemaining(history) > 0);
  if ((action === 'submit' && !canSubmit) || (action === 'accept' && history.state !== 'submitted') ||
    (action === 'request_revision' && (history.state !== 'submitted' || deliveryRevisionsRemaining(history) === 0)) ||
    (action === 'dispute' && !['submitted', 'revision_requested'].includes(history.state))) return invalid();
  choice(action, ['submit', 'accept', 'request_revision', 'dispute']);
  const base = JSON.stringify({ idempotency_key: key, unfunded_review: true, manifest_hash: history.manifest_hash,
    expected_version: history.latest_version, artifact_hash: history.latest_artifact_hash, notes,
    ...(action === 'accept' || action === 'request_revision' ? { decision: action } : {}) });
  let body = base;
  if (action === 'submit') {
    if (typeof rawArtifact !== 'string' || encoder.encode(rawArtifact).length > 16384) throw new Error('Artifact JSON must be at most 16 KiB.');
    try { artifact(JSON.parse(rawArtifact)); } catch { throw new Error('Artifact must be a flat JSON object with at most 100 nonblank keys and string values.'); }
    // Do NOT reserialize: preserve duplicate keys and escapes for Go's authoritative strict decoder.
    body = base.slice(0, -1) + ',"artifact":' + rawArtifact + '}';
  }
  return Object.freeze({ path: '/tasks/' + history.task_id + '/deliverables/' + history.deliverable_id + '/' + (action === 'submit' ? 'submissions' : action === 'dispute' ? 'disputes' : 'reviews'),
    body, action, version: history.latest_version, artifactHash: history.latest_artifact_hash });
}
