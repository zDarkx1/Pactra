import { handleWorkspaceRequest } from '../../../../lib/workspace-proxy.ts';
export const runtime = 'nodejs';
export const maxDuration = 40;
// Same HttpOnly session, exact origin, wallet identity and durable Go budgets as review.
export async function POST(request: Request) {
  return handleWorkspaceRequest(request, ['criteria', 'draft']);
}
