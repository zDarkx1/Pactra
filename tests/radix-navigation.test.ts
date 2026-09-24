import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('mobile navigation composes actual Radix Dialog and Accordion primitives', () => {
  const source = readFileSync(new URL('../frontend/components/landing-header.tsx', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{[^}]*Dialog[^}]*\}\s*from\s*"radix-ui"/);
  for (const primitive of ['Root', 'Trigger', 'Portal', 'Overlay', 'Content', 'Title', 'Description', 'Close']) {
    assert.ok(source.includes(`<Dialog.${primitive}`), `Dialog.${primitive}`);
  }
  assert.ok(source.includes('<Accordion.Root'));
  assert.ok(!source.includes('react-aria-components'));
});
for (const [width, motion] of [[390, 'reduce'], [320, 'no-preference']] as const) {
  test(`mobile ${width}: dismissal, focus, scrolling, destinations and breakpoint cleanup (${motion})`, { skip: !process.env.NAV_BROWSER }, async () => {
    const script = new URL('../scripts/polish-navigation.browser.mjs', import.meta.url).href;
    const { mobileNavigation } = await import(script);
    await mobileNavigation(width, motion);
  });
}
