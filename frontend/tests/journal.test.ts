import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
test('landing introduces a real long-form article with source-backed release boundaries',()=>{
 const landing=read('../app/page.tsx');
 assert.match(landing,/\/journal\/introducing-pactra/);
 const article=read('../app/journal/introducing-pactra/page.tsx');
 for(const source of ['PRODUCT.md','CHECKER.md','SETTLEMENT_DECISIONS.md','PERSISTENT_BACKEND.md','AZURE_AI.md','FRONTEND.md']) assert.ok(article.includes(source),source);
 for(const anchor of ['why-pactra','shared-scope','checking-work','ai-boundary','settlement','current-release','sources']) assert.ok(article.includes('id="'+anchor+'"'),anchor);
 assert.match(article,/accepted_unfunded/);
 assert.match(article,/not implemented/);
 assert.match(article,/<article/);
 assert.doesNotMatch(article,/dangerouslySetInnerHTML/);
});
