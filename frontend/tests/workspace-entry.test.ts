import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = resolve(import.meta.dirname, '..');
const nativeRequire = createRequire(import.meta.url);
const signedIn = { status: 'signedIn', address: '0x1111111111111111111111111111111111111111', config: { enabled: true, chain: { id: 31337, name: 'Test network' } } };

// Exercise the actual entry components with isolated session/navigation infrastructure.
function harness(initial = signedIn, pathname = '/tasks/new') {
  let session = initial;
  const effects: (() => void)[] = [];
  const redirects: string[] = [];
  const router = { replace: (href: string) => redirects.push(href) };
  const cache = new Map<string, any>();
  function load(file: string): any {
    const path = resolve(root, file);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    function require(name: string): any {
      if (name === 'react') return { ...React, useEffect: (effect: () => void) => effects.push(effect) };
      if (name.endsWith('workspace-provider')) return { useWorkspace: () => session };
      if (name.endsWith('wallet-control')) return { WalletControl: () => React.createElement('button', null, 'Test wallet control') };
      if (name.endsWith('/ui')) return { Icon: () => null };
      if (name === 'next/navigation') return { useRouter: () => router, usePathname: () => pathname };
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }: any) => React.createElement('a', props, children) };
      if (!name.startsWith('.')) return nativeRequire(name);
      const base = resolve(dirname(path), name);
      const target = [base, base + '.ts', base + '.tsx'].find(existsSync);
      assert.ok(target, name);
      return load(target);
    }
    new Function('require', 'module', 'exports', source)(require, module, module.exports);
    return module.exports;
  }
  return { load, redirects, setSession: (value: typeof initial) => { session = value; }, flush: () => { effects.splice(0).forEach(effect => effect()); } };
}

test('workspace entry preserves internal destinations and rejects external or looping redirects', () => {
  const { workspaceDestination } = harness().load('lib/workspace-navigation.ts');
  for (const path of ['/tasks', '/tasks/new', '/tasks/invitation-id?view=all#terms', '/checker', '/arbiter', '/dashboard']) {
    assert.equal(workspaceDestination(path), path);
  }
  for (const path of [undefined, '', 'https://example.com/tasks', '//example.com/tasks', '/\\example.com/tasks', 'javascript:alert(1)', '/connect', '/connect?returnTo=/connect', '/tasks/../connect', '/api/workspace/auth/logout', '/checker-other', '/tasks\n/new']) {
    assert.equal(workspaceDestination(path), '/tasks', String(path));
  }
});

test('workspace gate never mounts workspace content until the configured wallet session is signed in', () => {
  for (const session of [{ ...signedIn, status: 'signedOut' }, { ...signedIn, status: 'loading' }, { ...signedIn, config: { ...signedIn.config, enabled: false } }]) {
    const context = harness(session);
    const { WorkspaceGate } = context.load('components/workspace-gate.tsx');
    let mounted = false;
    const PrivateContent = () => { mounted = true; return React.createElement('div', null, 'PRIVATE_WORKSPACE'); };
    const html = renderToStaticMarkup(React.createElement(WorkspaceGate, null, React.createElement(PrivateContent)));
    assert.equal(mounted, false);
    assert.doesNotMatch(html, /PRIVATE_WORKSPACE/);
    assert.deepEqual(context.redirects, [], 'SSR must not navigate');
  }
});

test('restoring a session waits; signing out or expiring hides content and preserves the destination', () => {
  const context = harness({ ...signedIn, status: 'loading' });
  const { WorkspaceGate } = context.load('components/workspace-gate.tsx');
  const render = () => renderToStaticMarkup(React.createElement(WorkspaceGate, null, 'PRIVATE_WORKSPACE'));
  render(); context.flush();
  assert.deepEqual(context.redirects, []);
  context.setSession(signedIn);
  assert.match(render(), /PRIVATE_WORKSPACE/);
  context.flush(); assert.deepEqual(context.redirects, []);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { search: '?view=all', hash: '#terms' } } });
  try {
    context.setSession({ ...signedIn, status: 'signedOut' });
    assert.doesNotMatch(render(), /PRIVATE_WORKSPACE/);
    context.flush();
    assert.deepEqual(context.redirects, ['/connect?returnTo=%2Ftasks%2Fnew%3Fview%3Dall%23terms']);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('connect screen offers wallet sign-in and only continues after authentication', () => {
  const context = harness({ ...signedIn, status: 'signedOut' });
  const { ConnectWalletScreen } = context.load('components/connect-wallet-screen.tsx');
  const render = () => renderToStaticMarkup(React.createElement(ConnectWalletScreen, { returnTo: '/arbiter' }));
  const html = render();
  assert.match(html, /Connect your wallet/);
  assert.match(html, /Test wallet control/);
  assert.doesNotMatch(html, /Workspace sidebar/);
  context.flush(); assert.deepEqual(context.redirects, []);
  context.setSession({ ...signedIn, status: 'loading' });
  render(); context.flush(); assert.deepEqual(context.redirects, []);
  context.setSession(signedIn);
  render(); context.flush(); assert.deepEqual(context.redirects, ['/arbiter']);
});

test('Open Pactra and mobile entry point at the dedicated connect page; shell owns the gate', () => {
  const header = readFileSync(resolve(root, 'components/landing-header.tsx'), 'utf8');
  assert.match(header, /href="\/connect"[^>]*>Open Pactra/);
  assert.match(header, /href="\/connect"[^>]*>Open workspace/);
  const shell = readFileSync(resolve(root, 'components/app-shell.tsx'), 'utf8');
  assert.match(shell, /<WorkspaceGate><WorkspaceShell/);
});
