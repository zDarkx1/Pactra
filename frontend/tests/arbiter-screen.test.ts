import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('arbiter route is public-safe, linked, session-gated and never uses task-list or a role dropdown', () => {
  assert.match(read('app/arbiter/page.tsx'), /ArbiterDashboard/);
  assert.match(read('components/app-shell.tsx'), /href: "\/arbiter"/);
  const ui = read('components/arbiter-dashboard.tsx');
  assert.match(ui, /sessionKey/); assert.match(ui, /\/arbiter\/disputes/);
  assert.match(ui, /\/evidence/); assert.doesNotMatch(ui, /<select|\/tasks\?limit|localStorage/);
  assert.match(ui, /not proof of an onchain dispute/);
});
