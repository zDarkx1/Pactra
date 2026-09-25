// Structured acceptance criteria (criteria-v1, Rev1 allowlist).
// The AI only drafts; a human edits allowlisted variables, then the frozen JSON
// becomes the deterministic judging constant. Go marks drafts criteria-v1-draft
// and rejects them at freeze (criteria.go); this module normalizes a validated
// draft to v1-shaped criteria on apply, so freezing needs no reshape.
// This module never invents a draft: without a validated Go response there is
// nothing to show.

export const CRITERIA_VERSION = 'criteria-v1';
const CRITERIA_DRAFT_VERSION = 'criteria-v1-draft';
export const CRITERIA_CHECKER_VERSION = 'localization-v1';
export const CRITERIA_BODY_LIMIT = 16 * 1024;
export const CRITERIA_TEXT_LIMIT = 4000;
export const CRITERIA_PROMPT_LIMIT = 500;
export const CRITERIA_TERMS_LIMIT = 30;
export const CRITERIA_TERM_BYTES = 100;

export const CRITERIA_CHECK_IDS = ['key_parity', 'nonempty', 'placeholders', 'required_terms', 'length_bounds', 'human_review'] as const;
export type CriteriaCheckId = (typeof CRITERIA_CHECK_IDS)[number];

export type CriteriaCheck = { id: CriteriaCheckId; params: Record<string, unknown>; editable: boolean };
export type CriteriaV1 = { criteria_version: typeof CRITERIA_VERSION; checker_version: typeof CRITERIA_CHECKER_VERSION; checks: CriteriaCheck[] };
export type CriteriaProvenance = { field: string; source: 'ai' | 'default' };
export type CriteriaDraft = { status: 'draft'; criteria: CriteriaV1; provider?: string; model?: string; provenance?: CriteriaProvenance[] };
export type ParsedCriteria = { kind: 'json'; criteria: CriteriaV1 } | { kind: 'prose'; text: string };

export const CRITERIA_PROSE_ERROR = 'Enter nonblank acceptance criteria, up to 4,000 Unicode characters, without NUL.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function nonblank(value: string): boolean {
  return validUnicode(value) && /\S/.test(value);
}

// Mirror backend rules literally: at most 30 terms, each nonblank, at most 100 UTF-8 bytes.
function checkTerms(terms: unknown): string[] {
  if (!Array.isArray(terms) || terms.length > CRITERIA_TERMS_LIMIT) throw new Error('required_terms holds at most ' + CRITERIA_TERMS_LIMIT + ' terms.');
  const clean = terms.map(term => {
    if (typeof term !== 'string' || term.trim() === '' || utf8Bytes(term) > CRITERIA_TERM_BYTES) throw new Error('Each required term is nonblank and at most ' + CRITERIA_TERM_BYTES + ' bytes.');
    return term;
  });
  return [...clean];
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], what: string): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) throw new Error(what + ' holds exactly: ' + keys.join(', ') + '.');
}

function checkParams(id: CriteriaCheckId, params: unknown): Record<string, unknown> {
  if (!isRecord(params)) throw new Error('Check params must be an object.');
  switch (id) {
    case 'key_parity':
    case 'nonempty':
      exactKeys(params, [], id);
      return {};
    case 'placeholders':
      exactKeys(params, ['enabled'], id);
      if (typeof params.enabled !== 'boolean') throw new Error('placeholders.enabled is a boolean.');
      return { enabled: params.enabled };
    case 'required_terms':
      exactKeys(params, ['terms'], id);
      return { terms: checkTerms(params.terms) };
    case 'length_bounds': {
      exactKeys(params, ['min', 'max'], id);
      const { min, max } = params as { min: unknown; max: unknown };
      if (!Number.isInteger(min) || !Number.isInteger(max) || (min as number) < 0 || (max as number) > CRITERIA_TEXT_LIMIT || (min as number) > (max as number)) {
        throw new Error('length_bounds min/max are whole numbers with 0 <= min <= max <= ' + CRITERIA_TEXT_LIMIT + '.');
      }
      return { min, max };
    }
    case 'human_review':
      exactKeys(params, ['prompt', 'required'], id);
      if (typeof params.prompt !== 'string' || !nonblank(params.prompt) || Array.from(params.prompt).length > CRITERIA_PROMPT_LIMIT) {
        throw new Error('human_review.prompt is nonblank and at most ' + CRITERIA_PROMPT_LIMIT + ' characters.');
      }
      if (typeof params.required !== 'boolean') throw new Error('human_review.required is a boolean.');
      return { prompt: params.prompt, required: params.required };
  }
}

// Mirror the backend allowlist: fixed checks stay fixed, editable checks expose only listed fields.
export function validateCriteria(value: unknown): CriteriaV1 {
  if (!isRecord(value)) throw new Error('Structured criteria must be a JSON object.');
  exactKeys(value, ['criteria_version', 'checker_version', 'checks'], 'Structured criteria');
  if (value.criteria_version !== CRITERIA_VERSION) throw new Error('criteria_version must be ' + JSON.stringify(CRITERIA_VERSION) + '.');
  if (value.checker_version !== CRITERIA_CHECKER_VERSION) throw new Error('checker_version must be ' + JSON.stringify(CRITERIA_CHECKER_VERSION) + '.');
  if (!Array.isArray(value.checks) || value.checks.length < 1 || value.checks.length > CRITERIA_CHECK_IDS.length) {
    throw new Error('Structured criteria hold 1 to ' + CRITERIA_CHECK_IDS.length + ' checks.');
  }
  const seen = new Set<string>();
  const checks = value.checks.map(item => {
    if (!isRecord(item)) throw new Error('Each check is an object.');
    exactKeys(item, ['id', 'params', 'editable'], 'Each check');
    if (typeof item.id !== 'string' || !(CRITERIA_CHECK_IDS as readonly string[]).includes(item.id) || seen.has(item.id)) {
      throw new Error('Each check id is one of: ' + CRITERIA_CHECK_IDS.join(', ') + ', used once.');
    }
    seen.add(item.id);
    const id = item.id as CriteriaCheckId;
    const editable = item.id === 'key_parity' || item.id === 'nonempty' ? false : true;
    if (item.editable !== editable) throw new Error('Check ' + item.id + ' is ' + (editable ? 'human-editable.' : 'fixed.'));
    return { id, params: checkParams(id, item.params), editable };
  });
  const criteria: CriteriaV1 = { criteria_version: CRITERIA_VERSION, checker_version: CRITERIA_CHECKER_VERSION, checks };
  if (Array.from(JSON.stringify(criteria)).length > CRITERIA_TEXT_LIMIT) throw new Error('Structured criteria exceed 4,000 characters and cannot freeze into a deliverable.');
  return criteria;
}

// JSON object text is structured criteria; anything else that parses to a
// non-object (or fails to parse) stays legacy prose. A JSON object that fails
// validation throws instead of silently becoming prose.
export function parseCriteria(raw: string): ParsedCriteria {
  if (typeof raw !== 'string' || !nonblank(raw) || Array.from(raw).length > CRITERIA_TEXT_LIMIT) throw new Error(CRITERIA_PROSE_ERROR);
  let parsed: unknown = null;
  let isJson = false;
  try { parsed = JSON.parse(raw); isJson = true; } catch { isJson = false; }
  if (isJson && isRecord(parsed)) {
    try {
      return { kind: 'json', criteria: validateCriteria(parsed) };
    } catch (error) {
      throw new Error('Structured criteria are invalid: ' + (error as Error).message + ' Fix the JSON or use plain prose.');
    }
  }
  return { kind: 'prose', text: raw };
}

// Raw string request: the brief travels verbatim so Go sees duplicate keys and
// exact text instead of a re-encoded projection. gig_type is required by Go;
// only localization exists in v1.
export function buildDraftRequest(brief: string): string {
  if (typeof brief !== 'string' || !nonblank(brief) || Array.from(brief).length > CRITERIA_TEXT_LIMIT) {
    throw new Error('Describe the brief in nonblank text, up to ' + CRITERIA_TEXT_LIMIT + ' Unicode characters.');
  }
  const body = '{"brief":' + JSON.stringify(brief) + ',"gig_type":"localization"}';
  if (utf8Bytes(body) > CRITERIA_BODY_LIMIT) throw new Error('The brief exceeds 16 KiB. Shorten it before requesting a draft.');
  return body;
}

function checkProvenance(value: unknown): CriteriaProvenance[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new Error('Invalid AI criteria draft.');
  return value.map(item => {
    if (!isRecord(item) || Object.keys(item).length !== 2 || typeof item.field !== 'string' || !nonblank(item.field) || Array.from(item.field).length > 200) {
      throw new Error('Invalid AI criteria draft.');
    }
    if (item.source !== 'ai' && item.source !== 'default') throw new Error('Invalid AI criteria draft.');
    return { field: item.field, source: item.source as 'ai' | 'default' };
  });
}

// Draft checks the AI may emit (no length_bounds yet); editable is derived,
// never trusted from the wire.
const DRAFT_CHECK_IDS = ['key_parity', 'nonempty', 'placeholders', 'required_terms', 'human_review'] as const;

// Envelope validation. Accepts the Go envelope (status completed + advisory +
// criteria-v1-draft, normalized to v1) and its own normalized output (status
// draft), so the BFF and the browser share one validator. Anything else is
// rejected so the UI never renders a fabricated draft.
export function parseCriteriaDraftResponse(value: unknown): CriteriaDraft {
  if (!isRecord(value)) throw new Error('Invalid AI criteria draft.');
  const keys = Object.keys(value);
  if (!keys.includes('status') || !keys.includes('criteria') || keys.some(key => !['status', 'criteria', 'provider', 'model', 'advisory', 'provenance'].includes(key))) {
    throw new Error('Invalid AI criteria draft.');
  }
  let criteria: CriteriaV1;
  let provenance: CriteriaProvenance[] | undefined;
  if (value.status === 'completed' && value.advisory === true) {
    const raw = value.criteria;
    if (!isRecord(raw) || raw.criteria_version !== CRITERIA_DRAFT_VERSION || raw.checker_version !== CRITERIA_CHECKER_VERSION || !Array.isArray(raw.checks) || raw.checks.length < 1 || raw.checks.length > DRAFT_CHECK_IDS.length) {
      throw new Error('Invalid AI criteria draft.');
    }
    const checks = raw.checks.map(item => {
      if (!isRecord(item)) throw new Error('Invalid AI criteria draft.');
      const id = item.id;
      if (typeof id !== 'string' || !(DRAFT_CHECK_IDS as readonly string[]).includes(id)) throw new Error('Invalid AI criteria draft.');
      const editable = id === 'key_parity' || id === 'nonempty' ? false : true;
      return { id: id as CriteriaCheckId, params: checkParams(id as CriteriaCheckId, item.params), editable };
    });
    criteria = validateCriteria({ criteria_version: CRITERIA_VERSION, checker_version: CRITERIA_CHECKER_VERSION, checks });
    if (!('provenance' in value)) throw new Error('Invalid AI criteria draft.');
    provenance = checkProvenance(value.provenance);
  } else if (value.status === 'draft') {
    criteria = validateCriteria(value.criteria);
    if ('advisory' in value && value.advisory !== true) throw new Error('Invalid AI criteria draft.');
    if ('provenance' in value) provenance = checkProvenance(value.provenance);
  } else {
    throw new Error('Invalid AI criteria draft.');
  }
  const draft: CriteriaDraft = { status: 'draft', criteria };
  if (provenance) draft.provenance = provenance;
  for (const key of ['provider', 'model'] as const) {
    if (key in value) {
      if (typeof value[key] !== 'string') throw new Error('Invalid AI criteria draft.');
      draft[key] = value[key] as string;
    }
  }
  return draft;
}

export function summarizeCriteria(criteria: CriteriaV1): string {
  return 'Structured criteria ' + criteria.criteria_version + ' via ' + criteria.checker_version + ' · ' + criteria.checks.length + ' checks: ' + criteria.checks.map(check => check.id).join(', ') + '.';
}

export function describeCheck(check: CriteriaCheck): string {
  switch (check.id) {
    case 'key_parity': return 'Keys match between source and submission.';
    case 'nonempty': return 'Submission values are nonblank.';
    case 'placeholders': return 'Placeholder check ' + ((check.params.enabled as boolean) ? 'enabled.' : 'disabled.');
    case 'required_terms': {
      const terms = check.params.terms as string[];
      return terms.length + ' required term' + (terms.length === 1 ? '' : 's') + (terms.length ? ': ' + terms.map(term => JSON.stringify(term)).join(', ') : '.');
    }
    case 'length_bounds': return 'Length ' + String(check.params.min) + ' to ' + String(check.params.max) + ' characters.';
    case 'human_review': return 'Human prompt' + ((check.params.required as boolean) ? ' (required): ' : ': ') + JSON.stringify(check.params.prompt);
  }
}

// Human-edit trail: one line per changed editable value, newest value last.
export function criteriaDiff(before: CriteriaV1, after: CriteriaV1): string[] {
  const lines: string[] = [];
  const previous = new Map(before.checks.map(check => [check.id, check]));
  for (const check of after.checks) {
    const old = previous.get(check.id);
    if (!old) { lines.push(check.id + ': added.'); continue; }
    const left = JSON.stringify(old.params);
    const right = JSON.stringify(check.params);
    if (left !== right) lines.push(check.id + ': ' + left + ' → ' + right);
  }
  for (const check of before.checks) {
    if (!after.checks.some(next => next.id === check.id)) lines.push(check.id + ': removed.');
  }
  return lines;
}
