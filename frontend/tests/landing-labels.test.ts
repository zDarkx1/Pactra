import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('landing omits removed section labels while retaining headings', () => {
 const story = readFileSync(new URL('../components/scope-story.tsx', import.meta.url), 'utf8');
 const banner = readFileSync(new URL('../components/product-banner.tsx', import.meta.url), 'utf8');
 assert.doesNotMatch(story, /The working agreement \/ 01—03/);
 assert.doesNotMatch(banner, /Scope \/ evidence \/ people/);
 assert.match(story, /id="scope-story-title"/);
 assert.match(banner, /id="product-title"/);
});
