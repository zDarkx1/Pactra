import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const files = [...readdirSync(resolve(root, 'components/tasks')).filter(name => /\.tsx?$/.test(name)).map(name => 'components/tasks/' + name), 'app/checker/workbench.tsx', 'app/checker/checker-styles.ts', 'app/semantic-review.tsx', 'components/landing-evidence.tsx', 'components/landing-evidence-styles.ts'];
// SSR the actual components with only infrastructure replaced. No wallet, network, or live data.
function load(relative: string, config = { enabled: false, reason: 'Synthetic test configuration', arbiters: [] }) {
  const cache = new Map<string, { exports: any }>();
  function evaluate(path: string): any {
    if (cache.has(path)) return cache.get(path)!.exports;
    const module = { exports: {} as any };
    cache.set(path, module);
    const source = readFileSync(path, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = (name: string): any => {
      if (name.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
      if (name.endsWith('workspace-provider')) return { useWorkspace: () => ({ config, status: 'signedOut', address: undefined, sessionKey: 'synthetic' }) };
      if (name.endsWith('wallet-control')) return { WalletControl: () => React.createElement('button', null, 'Connect wallet') };
      if (name.endsWith('/ui')) return { Icon: () => React.createElement('svg', { 'aria-hidden': true }) };
      if (name === 'next/link') return { __esModule: true, default: ({ children, prefetch: _prefetch, ...props }: any) => React.createElement('a', props, children) };
      if (!name.startsWith('.')) return require(name);
      const base = resolve(dirname(path), name);
      const target = [base, base + '.ts', base + '.tsx'].find(candidate => existsSync(candidate));
      assert.ok(target, name);
      return evaluate(target);
    };
    new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
    return module.exports;
  }
  return evaluate(resolve(root, relative));
}

test('owned surfaces have no CSS module imports, inline style props, or injected CSS', () => {
  for (const file of files) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert.doesNotMatch(source, /\.module\.css|\bstyle\s*=\s*\{|dangerouslySetInnerHTML|<style\b/, file);
  }
  for (const file of ['components/tasks/tasks.module.css', 'components/tasks/task-list.module.css', 'app/checker/checker.module.css']) assert.equal(existsSync(resolve(root, file)), false, file);
});

test('checker initially renders literal placeholders, labelled editors and no claimed result', () => {
  const html = renderToStaticMarkup(React.createElement(load('app/checker/workbench.tsx').default));
  assert.match(html, /Hello \{name\}/);
  assert.match(html, /Keep tokens such as \{name\} intact/);
  assert.match(html, /for="checker-source"/);
  assert.match(html, /id="checker-source"[^>]*aria-describedby="checker-json-help"/);
  assert.match(html, /Your evidence starts here/);
  assert.match(html, /This does not submit work to a task/);
  assert.doesNotMatch(html, /✓ Checks passed/);
});

test('AI review remains consent-gated and advisory', () => {
  const html = renderToStaticMarkup(React.createElement(load('app/semantic-review.tsx').default, { body: null }));
  assert.match(html, /AI meaning review/);
  assert.match(html, /disabled=""/);
  assert.match(html, /AI assesses meaning, not acceptance or payment/);
  assert.match(html, /No AI assessment available/);
});

test('landing sample renders missing placeholder as text without inventing a response', () => {
  const html = renderToStaticMarkup(React.createElement(load('components/landing-evidence.tsx').default));
  assert.match(html, /<mark>\{name\}<\/mark>/);
  assert.match(html, /<code>Halo\.<\/code>/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /Run the sample to see the actual checker response/);
  assert.doesNotMatch(html, /Go response/);
});

test('task session boundary never renders private children while unavailable or signed out', () => {
  for (const enabled of [false, true]) {
    const { TaskSession } = load('components/tasks/task-shared.tsx', { enabled, reason: 'Synthetic test configuration', arbiters: [] });
    const html = renderToStaticMarkup(React.createElement(TaskSession, null, 'PRIVATE_SENTINEL'));
    assert.doesNotMatch(html, /PRIVATE_SENTINEL/);
    assert.match(html, /Task access is limited to its buyer and worker/);
    assert.match(html, enabled ? /Connecting alone does not sign you in/ : /Workspace setup is pending/);
  }
});

test('task loading is an announced placeholder, not fabricated task data', () => {
  const { TaskLoading } = load('components/tasks/task-shared.tsx');
  const html = renderToStaticMarkup(React.createElement(TaskLoading));
  assert.match(html, /role="status" aria-live="polite"/);
  assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, 3);
  assert.match(html, /Loading tasks…/);
});

test('exact deliverable allocations and literal criteria survive rendering', () => {
  const { DeliverableDetails } = load('components/tasks/manifest-details.tsx');
  const html = renderToStaticMarkup(React.createElement(DeliverableDetails, { deliverables: [{ id: 'synthetic', title: 'Synthetic', criteria: 'Keep {name}; <script> is text.', amount_base_units: '9007199254740993', revision_limit: 0, review_period_hours: 24 }] }));
  assert.match(html, /9007199254740993/);
  assert.match(html, /Keep \{name\}; &lt;script&gt; is text/);
  assert.match(html, /24 hours/);
});

test('request cancellation, consent, pending and native constraint wiring stay in place', () => {
  const checker = readFileSync(resolve(root, 'app/checker/workbench.tsx'), 'utf8');
  const review = readFileSync(resolve(root, 'app/semantic-review.tsx'), 'utf8');
  const form = readFileSync(resolve(root, 'components/tasks/task-form.tsx'), 'utf8');
  assert.match(checker, /request\.cancel\(\)/);
  assert.match(checker, /pending\.isCurrent\(\)/);
  assert.match(review, /!consent \|\| busy/);
  assert.match(review, /credentials: 'omit', cache: 'no-store'/);
  assert.match(form, /fieldset disabled=\{blocked \|\| pending \|\| uncertain\}/);
  assert.match(form, /type="datetime-local" step="60"/);
  assert.match(form, /noValidate autoComplete="off"/);
});
