import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as phosphorSSR from '@phosphor-icons/react/dist/ssr';

const root = fileURLToPath(new URL('../components/', import.meta.url));
// Exercise the real TSX without introducing a test-only runtime dependency.
function loadComponent(file: string): any {
  const filename = resolve(root, file);
  const nativeRequire = createRequire(filename);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  // Phosphor 2.1.10's require condition points to CJS in a type:module .js file.
  // Use its real ESM SSR exports, exactly as Next's bundler does (not a mock).
  const require = (id: string) => id === '@phosphor-icons/react/dist/ssr' ? phosphorSSR : id.startsWith('./') ? loadComponent(resolve(dirname(filename), id + '.ts')) : nativeRequire(id);
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}

test('shell and wallet use utility maps, not CSS modules or homemade SVG', () => {
  for (const file of ['app-shell.tsx', 'ui.tsx', 'wallet-control.tsx']) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert.doesNotMatch(source, /\.module\.css|<svg|<path\b/);
  }
  assert.equal(existsSync(resolve(root, 'shell.module.css')), false);
  assert.equal(existsSync(resolve(root, 'wallet.module.css')), false);
});

test('all public icons render actual accessible Phosphor SSR SVGs', () => {
  const { Icon } = loadComponent('ui.tsx');
  for (const name of ['panel-left', 'home', 'arrow-left', 'arrow-right', 'arrow-up-right', 'arrow-down', 'tasks', 'checker', 'menu', 'close', 'check', 'info', 'plus', 'search', 'refresh', 'clock', 'wallet', 'lock', 'copy', 'chevron-right']) {
    const html = renderToStaticMarkup(createElement(Icon, { name, className: 'test-icon' }));
    assert.match(html, /viewBox="0 0 256 256"/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, new RegExp(`data-icon="${name}"`));
    assert.match(html, /test-icon/);
  }
});

test('RAC Button preserves pending, disabled, form and variant semantics', () => {
  const { Button } = loadComponent('ui.tsx');
  const html = renderToStaticMarkup(createElement(Button, { pending: true, pendingLabel: 'Saving agreement…', type: 'submit', name: 'action', value: 'save', variant: 'secondary', className: 'caller-class' }, 'Save'));
  assert.match(html, /data-rac/);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /name="action"/);
  assert.match(html, /value="save"/);
  assert.match(html, /data-variant="secondary"/);
  assert.match(html, /caller-class/);
  assert.match(html, /Saving agreement…/);
  const enabled = renderToStaticMarkup(createElement(Button, {}, 'Go'));
  assert.doesNotMatch(enabled, /disabled=""/);
  assert.match(enabled, /type="button"/);
});

test('RAC ButtonLink renders one real Next anchor and accepts object hrefs', () => {
  const { ButtonLink } = loadComponent('ui.tsx');
  const html = renderToStaticMarkup(createElement(ButtonLink, { href: { pathname: '/tasks', query: { view: 'all' } }, variant: 'quiet', target: '_blank', rel: 'noopener', className: 'caller-link' }, 'Tasks'));
  assert.equal((html.match(/<a\b/g) || []).length, 1);
  assert.match(html, /href="\/tasks\?view=all"/);
  assert.match(html, /data-rac/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /caller-link/);
});

test('InlineAlert retains roles, titles and all tone variants', () => {
  const { InlineAlert } = loadComponent('ui.tsx');
  for (const tone of ['info', 'error', 'warning', 'success']) {
    const html = renderToStaticMarkup(createElement(InlineAlert, { tone, title: 'Notice' }, 'Details'));
    assert.match(html, new RegExp(`role="${tone === 'error' ? 'alert' : 'status'}"`));
    assert.match(html, /<strong>Notice<\/strong>/);
    assert.match(html, /Details/);
  }
});

test('native Button click handlers are called once, cancellable and blocked while pending', () => {
  const { Button, ButtonLink } = loadComponent('ui.tsx');
  let clicks = 0;
  let ariaClicks = 0;
  const event = { detail: 1, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  const button = Button({ onClick: (received: unknown) => { assert.equal(received, event); clicks++; }, children: 'Save' });
  button.props.render({ onClick: () => { ariaClicks++; } }).props.onClick(event);
  assert.equal(clicks, 1);
  assert.equal(ariaClicks, 1);
  Button({ pending: true, onClick: () => { clicks++; } }).props.render({}).props.onClick(event);
  assert.equal(clicks, 1);
  const cancelled = { ...event, defaultPrevented: false };
  Button({ onClick: (e: typeof event) => e.preventDefault() }).props.render({ onClick: () => { ariaClicks++; } }).props.onClick(cancelled);
  assert.equal(ariaClicks, 1);
  const link = ButtonLink({ href: '/tasks', onClick: (e: typeof event) => e.preventDefault() });
  link.props.render({ href: '/tasks', onClick: () => { ariaClicks++; } }).props.onClick({ ...event, defaultPrevented: false });
  assert.equal(ariaClicks, 1);
});

test('every shell/wallet utility class compiles with the installed Tailwind 4 engine', async () => {
  const { __unstable__loadDesignSystem } = await import('tailwindcss');
  const nativeRequire = createRequire(import.meta.url);
  const theme = readFileSync(nativeRequire.resolve('tailwindcss/theme.css'), 'utf8');
  const design = await __unstable__loadDesignSystem(theme);
  const flatten = (value: unknown): string[] => typeof value === 'string' ? value.split(/\s+/) : Object.values(value as Record<string, unknown>).flatMap(flatten);
  const candidates = [...new Set([...flatten(loadComponent('shell-styles.ts')), ...flatten(loadComponent('wallet-styles.ts'))])].filter(name => name && !name.startsWith('group/'));
  const css = design.candidatesToCss(candidates);
  assert.deepEqual(candidates.filter((_, i) => css[i] === null), []);
});

test('mobile navigation delegates modality to RAC and preserves motion/focus contracts', () => {
  const source = readFileSync(resolve(root, 'app-shell.tsx'), 'utf8');
  for (const component of ['DialogTrigger', 'ModalOverlay', 'Modal', 'Dialog']) assert.match(source, new RegExp(`<${component}\\b`));
  assert.doesNotMatch(source, /showModal|HTMLDialogElement|documentElement\.style\.overflow/);
  for (const contract of ['pactra:focus-main', 'main-content', 'min-width: 768px', 'prefers-reduced-motion: reduce', 'visibilitychange', 'data-sidebar-motion', 'pactra:sidebar']) assert.ok(source.includes(contract));
});
