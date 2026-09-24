import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
test('article separates primary external evidence from implementation notes',()=>{const p=read('../app/journal/introducing-pactra/page.tsx');assert.match(p,/external-evidence/);assert.match(p,/EvidenceCite/);assert.match(p,/not.*prove|not.*demonstrate/)});
test('heavy sample loads near viewport with accessible manual fallback',()=>{const p=read('../components/lazy-evidence.tsx');assert.match(p,/IntersectionObserver/);assert.match(p,/import\("\.\/landing-evidence"\)/);assert.match(p,/disconnect/);assert.match(p,/Load interactive sample/)});
test('heading enhancement respects motion and reverts on navigation',()=>{const p=read('../components/heading-entrance.tsx');assert.match(p,/prefers-reduced-motion/);assert.match(p,/revert/);assert.match(p,/h1/)});
