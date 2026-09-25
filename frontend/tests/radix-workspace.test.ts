import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as phosphor from '@phosphor-icons/react/dist/ssr';

const root = resolve(import.meta.dirname, '..');
const nativeRequire = createRequire(import.meta.url);
// Explicit fake provider context ONLY in tests. No actual session, transport or wallet.
function load(file: string, session: any) {
  const cache = new Map<string, any>();
  function evaluate(path: string): any {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    function require(name: string): any {
      if (name.endsWith('workspace-provider')) return { useWorkspace: () => session };
      if (name.endsWith('wallet-control')) return { WalletControl: () => React.createElement('button', null, 'Test wallet') };
      if (name === 'next/navigation') return { useRouter: () => ({ replace() { throw new Error('SSR must not mutate'); } }) };
      if (name === '@phosphor-icons/react/dist/ssr') return phosphor;
      if (!name.startsWith('.')) return nativeRequire(name);
      const base = resolve(dirname(path), name);
      const target = [base, base + '.ts', base + '.tsx'].find(existsSync);
      assert.ok(target, name); return evaluate(target);
    }
    new Function('require', 'module', 'exports', source)(require, module, module.exports);
    return module.exports;
  }
  return evaluate(resolve(root, file));
}
const session = { status: 'signedIn', address: '0x1111111111111111111111111111111111111111', sessionKey: 1, config: { enabled: true, chain: { id: 31337 }, arbiters: [] } };

test('arbiter setup is informative, precise and leaves creation disabled', () => {
  const Form = load('components/tasks/task-form.tsx', session).default;
  const html = renderToStaticMarkup(React.createElement(Form));
  assert.match(html, /Agreement creation awaiting arbiter setup/);
  assert.match(html, /two distinct, real, consenting team arbiter wallet addresses/);
  assert.match(html, /PACTRA_ARBITERS/);
  assert.match(html, /both the frontend and backend/);
  assert.match(html, /href="\/checker"/);
  assert.match(html, /href="\/tasks"/);
  assert.match(html, /<fieldset disabled=""/);
  assert.doesNotMatch(html, /role="alert"|Task creation unavailable/);
});

test('one address or duplicate addresses cannot unlock the arbiter gate', () => {
  for (const arbiters of [[session.address], [session.address, session.address.toUpperCase().replace('0X', '0x')]]) {
    const Form = load('components/tasks/task-form.tsx', { ...session, config: { ...session.config, arbiters } }).default;
    assert.match(renderToStaticMarkup(React.createElement(Form)), /<fieldset disabled=""/);
  }
});

test('loading, disconnected and disabled sessions never SSR private content', () => {
  for (const status of ['loading', 'signedOut']) {
    const { TaskSession } = load('components/tasks/task-shared.tsx', { ...session, status });
    const html = renderToStaticMarkup(React.createElement(TaskSession, null, 'PRIVATE_SENTINEL'));
    assert.doesNotMatch(html, /PRIVATE_SENTINEL/);
  }
});

test('task button defaults to non-submit and forwards native form semantics', () => {
  const { TaskButton } = load('components/tasks/task-shared.tsx', session);
  assert.match(renderToStaticMarkup(React.createElement(TaskButton, null, 'Copy')), /type="button"/);
  const html = renderToStaticMarkup(React.createElement(TaskButton, { type: 'submit', disabled: true, name: 'intent', value: 'create' }, 'Create'));
  assert.match(html, /type="submit"/); assert.match(html, /disabled=""/); assert.match(html, /name="intent"/);
});

test('workspace confirmation uses real Radix primitives and explicit consent', () => {
  const source = readFileSync(resolve(root, 'components/tasks/task-shared.tsx'), 'utf8');
  assert.match(source, /from 'radix-ui'/);
  for (const name of ['Root', 'Portal', 'Overlay', 'Content', 'Title', 'Description']) assert.ok(source.includes('Dialog.' + name));
  assert.match(source, /type="checkbox"/);
  assert.match(source, /!acknowledged/);
  assert.match(source, /sessionKey/);
  assert.match(source, /onCloseAutoFocus/);
});
