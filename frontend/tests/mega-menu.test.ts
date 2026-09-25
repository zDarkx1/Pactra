import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('desktop navigation uses actual Radix NavigationMenu primitives', () => {
  const source = readFileSync(new URL('../components/landing-header.tsx', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{[^}]*NavigationMenu[^}]*\}\s*from\s*"radix-ui"/);
  for (const primitive of ['Root', 'List', 'Item', 'Trigger', 'Content', 'Link']) {
    assert.ok(source.includes(`<NavigationMenu.${primitive}`), primitive);
  }
});
test('desktop pointer transit, keyboard, dismissal and anchor behavior', { skip: !process.env.NAV_BROWSER }, async () => {
  const script = new URL('../../scripts/polish-navigation.browser.mjs', import.meta.url).href;
  const { desktopNavigation } = await import(script);
  await desktopNavigation();
});
