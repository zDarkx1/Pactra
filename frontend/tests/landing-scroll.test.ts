import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
test('landing removes eyebrow and uses scoped optional scroll motion',()=>{
 const p=read('../app/page.tsx');assert.doesNotMatch(p,/A shared starting point/);assert.match(p,/LandingScroll/);
 const m=read('../components/landing-scroll.tsx');assert.match(m,/prefers-reduced-motion/);assert.match(m,/import\("gsap/);assert.match(m,/revert/);assert.doesNotMatch(m,/pin:\s*true|scrollTo:|preventDefault/);
});
