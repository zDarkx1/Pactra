import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const get=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('Tailwind v4 PostCSS and theme drive styling',()=>{assert.match(get('../postcss.config.mjs'),/@tailwindcss\/postcss/);assert.match(get('../app/globals.css'),/@import ['"]tailwindcss/);assert.match(get('../app/globals.css'),/@theme/)});
test('landing retains real Pactra destinations and user shader banner',()=>{const page=get('../app/page.tsx');assert.match(page,/LandingHeader/);assert.match(page,/ProductBanner/);assert.match(page,/\/tasks/);assert.match(page,/\/checker/);assert.doesNotMatch(page,/landing\.module\.css/);assert.match(page,/Funding.*not available|unfunded/i)});
