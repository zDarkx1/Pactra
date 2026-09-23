import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>['node_modules','.git','.next','bin'].includes(e.name)?[]:e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
test('all local markdown links resolve',()=>{for(const file of walk(root).filter(p=>p.endsWith('.md'))){for(const m of readFileSync(file,'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const target=m[1].split('#')[0];if(!target||/^[a-z]+:/i.test(target))continue;assert.ok(existsSync(resolve(dirname(file),target)),`${file}: ${target}`)}}});
test('handoff entry points and real startup command exist',()=>{for(const p of ['docs/VERIFICATION.md','docs/API.md','docs/FRONTEND.md','docs/BACKEND.md','contracts/README.md','backend/cmd/server/main.go','frontend/app/page.tsx','frontend/.env.example','backend/.env.example'])assert.ok(existsSync(join(root,p)),p)});

test('Pactra package, module, schema, and env names stay aligned', () => {
  const read = path => readFileSync(join(root, path), 'utf8');
  const manifest = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(manifest.name, 'pactra-monorepo');
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.packages[''].name, manifest.name);
  assert.equal(read('backend/go.mod').split('\n')[0].trim(), 'module pactra/backend');
  assert.match(read('backend/migrations/0001_workspace.sql'), /CREATE SCHEMA IF NOT EXISTS pactra;/);
  for (const path of ['frontend/.env.example', 'backend/.env.example']) {
    assert.match(read(path), /^PACTRA_CHAIN_ID=/m);
    assert.match(read(path), /^PACTRA_ARBITERS=/m);
  }
  for (const path of ['frontend/components/app-shell.tsx', 'frontend/components/navigation-focus.tsx']) {
    assert.ok(read(path).includes('pactra:focus-main'), path);
  }
  for (const path of ['frontend/components/workspace-provider.tsx', 'frontend/lib/workspace-client.ts']) {
    assert.ok(read(path).includes('pactra:session-expired'), path);
  }
});
