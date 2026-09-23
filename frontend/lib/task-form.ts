import type { Deliverable, Manifest } from './workspace-types.ts';

export const UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);
export const TASK_BODY_LIMIT = 64 * 1024;
export type TaskCreateInput = Pick<Manifest, 'title' | 'source' | 'worker' | 'primary_arbiter' | 'backup_arbiter' | 'delivery_deadline' | 'deliverables'>;
export type DeliverableDraft = Omit<Deliverable, 'revision_limit' | 'review_period_hours'> & {
  revision_limit: string;
  review_period_hours: string;
};
export type TaskDraft = Omit<TaskCreateInput, 'source' | 'deliverables'> & {
  source: string;
  deliverables: DeliverableDraft[];
};
export type TaskFormErrors = Record<string, string>;
export type TaskValidation =
  | { ok: false; errors: TaskFormErrors }
  | { ok: true; input: TaskCreateInput; body: string; total: string };

export function newDeliverable(index: number): DeliverableDraft {
  return { id: 'deliverable-' + index, title: '', criteria: '', amount_base_units: '', revision_limit: '2', review_period_hours: '48' };
}

export function newTaskDraft(now = Date.now()): TaskDraft {
  return {
    title: '', source: '{}', worker: '', primary_arbiter: '', backup_arbiter: '',
    delivery_deadline: new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    deliverables: [newDeliverable(1)],
  };
}

function validUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function bounded(value: string, max: number): boolean {
  const characters = Array.from(value);
  const whitespace = (character: string) => {
    const code = character.codePointAt(0)!;
    return (code >= 9 && code <= 13) || (code >= 0x2000 && code <= 0x200a) || [32, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000].includes(code);
  };
  return validUnicode(value) && characters.some(character => !whitespace(character)) && characters.length <= max;
}

export function isTaskAddress(value: string): boolean {
  return /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
}

function goEncodedBytes(value: unknown): number {
  const encoded = Array.from(JSON.stringify(value), character => {
    const code = character.charCodeAt(0);
    return '<>&'.includes(character) || code === 8232 || code === 8233
      ? String.fromCharCode(92) + 'u' + code.toString(16).padStart(4, '0') : character;
  }).join('');
  return new TextEncoder().encode(encoded).byteLength;
}

export function parseTaskSource(raw: string): Record<string, string> {
  if (new TextEncoder().encode(raw).byteLength > TASK_BODY_LIMIT) throw new Error('Source input is too large (64 KiB maximum before parsing).');
  const source: Record<string, string> = Object.create(null);
  const token = /"(?:[^"\\]|\\.)*"/y;
  let cursor = 0;
  const skipWhitespace = () => { while (cursor < raw.length && [9, 10, 13, 32].includes(raw.charCodeAt(cursor))) cursor++; };
  const take = (character: string) => {
    skipWhitespace();
    if (raw[cursor] !== character) throw new Error('Source must be one flat JSON object with string values only.');
    cursor++;
  };
  const readString = (): string => {
    skipWhitespace();
    token.lastIndex = cursor;
    const match = token.exec(raw);
    if (!match) throw new Error('Source keys and values must be JSON strings.');
    cursor = token.lastIndex;
    let value: string;
    try { value = JSON.parse(match[0]); } catch { throw new Error('Source must contain valid JSON strings.'); }
    if (!validUnicode(value)) throw new Error('Source cannot contain NUL or unpaired Unicode surrogates.');
    return value;
  };
  take('{');
  skipWhitespace();
  if (raw[cursor] !== '}') {
    while (true) {
      const key = readString();
      if (!bounded(key, 160)) throw new Error('Source keys must be nonblank and at most 160 Unicode characters.');
      if (Object.hasOwn(source, key)) throw new Error('Duplicate source key: ' + key + '. Keep each key once.');
      take(':');
      source[key] = readString();
      if (Object.keys(source).length > 100) throw new Error('Source supports at most 100 keys.');
      skipWhitespace();
      if (raw[cursor] !== ',') break;
      cursor++;
    }
  }
  take('}');
  skipWhitespace();
  if (cursor !== raw.length) throw new Error('Remove trailing data after the source object.');
  if (goEncodedBytes(source) > 16 * 1024) throw new Error('Source exceeds 16 KiB in the server JSON encoding.');
  return source;
}

export function deadlineToUtc(value: string): string | null {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(value)) return null;
  const date = new Date(value + ':00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 16) !== value) return null;
  return date.toISOString().replace('.000Z', 'Z');
}

export function validateTaskDraft(draft: TaskDraft, buyer: string, arbiters: readonly string[], now = Date.now()): TaskValidation {
  const errors: TaskFormErrors = {};
  if (!bounded(draft.title, 160)) errors.title = 'Enter a nonblank title of at most 160 Unicode characters, without NUL.';
  let source: Record<string, string> = {};
  try { source = parseTaskSource(draft.source); } catch (error) { errors.source = (error as Error).message; }
  if (!isTaskAddress(buyer)) errors._form = 'A valid signed-in buyer address is required.';
  const parties = new Set([buyer.toLowerCase()]);
  for (const field of ['worker', 'primary_arbiter', 'backup_arbiter'] as const) {
    const address = draft[field];
    if (!isTaskAddress(address)) errors[field] = 'Enter a nonzero EVM address (0x followed by 40 hex characters).';
    else if (parties.has(address.toLowerCase())) errors[field] = 'Buyer, worker, and both arbiters must all be different.';
    parties.add(address.toLowerCase());
  }
  const allowlist = new Set(arbiters.map(address => address.toLowerCase()));
  if (allowlist.size === 0) errors._form = 'Task creation is unavailable: no official arbiters are configured.';
  for (const field of ['primary_arbiter', 'backup_arbiter'] as const) {
    if (!errors[field] && !allowlist.has(draft[field].toLowerCase())) errors[field] = 'Choose an arbiter from the official allowlist.';
  }
  const deadline = deadlineToUtc(draft.delivery_deadline);
  if (!deadline || !Number.isFinite(now) || Date.parse(deadline) < now + 60 * 60 * 1000 || Date.parse(deadline) > now + 90 * 24 * 60 * 60 * 1000) {
    errors.delivery_deadline = 'Use a valid UTC deadline from 1 hour to 90 days ahead. Leave time for request processing.';
  }
  if (draft.deliverables.length < 1 || draft.deliverables.length > 10) errors.deliverables = 'Add between 1 and 10 deliverables.';
  const ids = new Set<string>();
  let total = BigInt(0);
  const deliverables: Deliverable[] = draft.deliverables.map((item, index) => {
    const prefix = 'deliverables.' + index;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || item.id.length > 64) errors[prefix + '.id'] = 'Use a lowercase slug, up to 64 characters (for example, proof-1).';
    else if (ids.has(item.id)) errors[prefix + '.id'] = 'Each deliverable needs a unique ID.';
    ids.add(item.id);
    if (!bounded(item.title, 160)) errors[prefix + '.title'] = 'Enter a nonblank title of at most 160 Unicode characters, without NUL.';
    if (!bounded(item.criteria, 4000)) errors[prefix + '.criteria'] = 'Enter nonblank acceptance criteria, up to 4,000 Unicode characters, without NUL.';
    if (!/^[1-9][0-9]{0,77}$/.test(item.amount_base_units) || BigInt(item.amount_base_units) > UINT256_MAX) {
      errors[prefix + '.amount_base_units'] = 'Use a positive uint256 integer string, without leading zeros or decimals.';
    } else total += BigInt(item.amount_base_units);
    if (!/^[0-5]$/.test(item.revision_limit)) errors[prefix + '.revision_limit'] = 'Choose a revision limit from 0 to 5.';
    if (!/^[0-9]{2,3}$/.test(item.review_period_hours) || Number(item.review_period_hours) < 24 || Number(item.review_period_hours) > 168) {
      errors[prefix + '.review_period_hours'] = 'Use a whole number from 24 to 168 hours.';
    }
    return { ...item, revision_limit: Number(item.revision_limit), review_period_hours: Number(item.review_period_hours) };
  });
  if (total > UINT256_MAX) errors.deliverables = 'The sum of all amounts must also fit uint256.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const input: TaskCreateInput = {
    title: draft.title, source, worker: draft.worker.toLowerCase(), primary_arbiter: draft.primary_arbiter.toLowerCase(), backup_arbiter: draft.backup_arbiter.toLowerCase(),
    delivery_deadline: deadline!, deliverables,
  };
  const body = JSON.stringify(input);
  if (new TextEncoder().encode(body).byteLength > TASK_BODY_LIMIT) return { ok: false, errors: { _form: 'The full request exceeds 64 KiB. Reduce source or criteria text.' } };
  return { ok: true, input, body, total: total.toString() };
}
