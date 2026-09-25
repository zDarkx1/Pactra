import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
test('expansion geometry is reserved in server markup before GSAP loads',()=>{const p=read('../components/product-banner.tsx');assert.match(p,/motion-safe:h-\[200svh\]/);assert.match(p,/motion-safe:sticky/);assert.doesNotMatch(read('../components/landing-scroll.tsx'),/gsap\.set\(scene,\s*\{\s*height/)});
test('creative scenes keep semantic readable server content and separate visual layers',()=>{const p=read('../components/scope-story.tsx');assert.match(p,/data-scope-paper/);assert.match(p,/data-scope-seal/);assert.match(p,/id="capabilities"/);assert.match(p,/Neither action moves funds/)});
