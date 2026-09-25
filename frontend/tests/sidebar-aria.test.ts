import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('sidebar uses Next anchors, Radix collapsed tooltips and preserved modified clicks', () => {
  const source = readFileSync(new URL('../components/app-shell.tsx', import.meta.url), 'utf8');
  assert.match(source, /<Link href=\{href\}/);
  assert.match(source, /<Tooltip.Trigger asChild>/);
  assert.match(source, /<Tooltip.Content side="right"/);
  assert.match(source, /aria-label=\{compact\?label:undefined\}/);
  assert.match(source, /aria-current/);
  for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) assert.ok(source.includes('event.' + key));
  assert.doesNotMatch(source, /role="menu"|react-aria-components/);
});
