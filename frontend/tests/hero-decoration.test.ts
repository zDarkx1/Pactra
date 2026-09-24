import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('hero starts with its headline, without the diamond ornament', () => {
  const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const hero = source.slice(source.indexOf('data-central-hero'), source.indexOf('</h1>'));
  assert.doesNotMatch(hero, /rotate-45|border-current/);
  assert.match(hero, /<h1/);
});
