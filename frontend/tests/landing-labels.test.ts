import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('landing omits removed section labels while retaining headings', () => {
 const story = readFileSync(new URL('../components/scope-story.tsx', import.meta.url), 'utf8');
 const banner = readFileSync(new URL('../components/product-banner.tsx', import.meta.url), 'utf8');
 assert.doesNotMatch(story, /The working agreement \/ 01—03/);
 assert.doesNotMatch(banner, /Scope \/ evidence \/ people/);
 const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
 for (const label of ['From your side. From their side.', '01 / Clear terms', '02 / Shared evidence', '03 / Human decisions', 'Localization JSON today. Unfunded agreements only.', 'Illustrative record · No funds move', 'Small detail. Real difference.', 'A deliberate boundary', 'Ideas behind the product', 'Pactra / Project notes']) assert.ok(!(story + banner + page).includes(label), label);
 assert.match(story, /id="scope-story-title"/);
 assert.match(banner, /id="product-title"/);
});
