import type { CheckInput, ViewState } from './types.ts';

export function validateStringObject(raw: string, label: string): void {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(`${label} must be valid JSON.`); }
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || !Object.values(value).every(item => typeof item === 'string')) {
    throw new Error(`${label} must be a JSON object with string values only.`);
  }
}

export function buildRawRequest(input: CheckInput): string {
  validateStringObject(input.source, 'Source');
  validateStringObject(input.submission, 'Submission');
  const rules = JSON.stringify({ preserve_placeholders: input.preservePlaceholders, required_terms: input.requiredTerms.split(/[,\n]/).map(term => term.trim()).filter(Boolean) });
  // Validation may parse; serialization must not. Keep duplicate keys for the authoritative checker.
  return `{"source":${input.source},"submission":${input.submission},"rules":${rules}}`;
}

export function invalidateResult(): ViewState { return { result: null, error: null, loading: false }; }
