export type Check = { id: string; key: string; status: 'pass' | 'fail'; message: string };
export type CheckResponse = {
  checker_version: 'localization-v1';
  passed: boolean;
  checks: Check[];
  ai_review: { status: 'not_configured'; message: 'Semantic review is not implemented. Human review required.' };
};
export type CheckInput = { source: string; submission: string; preservePlaceholders: boolean; requiredTerms: string };
export type ViewState = { result: CheckResponse | null; error: string | null; loading: boolean };
