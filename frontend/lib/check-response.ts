import type { CheckResponse } from './types.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function isCheckResponse(value: unknown): value is CheckResponse {
  if (!record(value) || value.checker_version !== 'localization-v1' || typeof value.passed !== 'boolean' || !Array.isArray(value.checks) || value.checks.length === 0 || value.checks.length > 10000) return false;
  if (!value.checks.every(check => record(check) && typeof check.id === 'string' && typeof check.key === 'string' && (check.status === 'pass' || check.status === 'fail') && typeof check.message === 'string')) return false;
  if (value.passed !== value.checks.every(check => check.status === 'pass')) return false;
  return record(value.ai_review) && value.ai_review.status === 'not_configured' && value.ai_review.message === 'Semantic review is not implemented. Human review required.';
}
