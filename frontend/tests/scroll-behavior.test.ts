import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getScrollBehavior, installScrollBehavior } from '../lib/scroll-behavior.ts';

test('only primary pointer presses and pointer clicks opt into smooth scrolling', () => {
  assert.equal(getScrollBehavior({ type: 'pointerdown', button: 0, isPrimary: true }), 'smooth');
  assert.equal(getScrollBehavior({ type: 'click', detail: 1, button: 0 }), 'smooth');
  assert.equal(getScrollBehavior({ type: 'click', detail: 2, button: 0 }), 'smooth');
  for (const button of [1, 2]) {
    assert.equal(getScrollBehavior({ type: 'pointerdown', button, isPrimary: true }), 'auto');
    assert.equal(getScrollBehavior({ type: 'click', detail: 1, button }), 'auto');
  }
  assert.equal(getScrollBehavior({ type: 'pointerdown', button: 0, isPrimary: false }), 'auto');
});

test('keyboard, assistive clicks, focus, validation, and history stay instant', () => {
  assert.equal(getScrollBehavior({ type: 'click', detail: 0, button: 0 }), 'auto');
  assert.equal(getScrollBehavior({ type: 'click' }), 'auto');
  for (const type of ['keydown', 'focus', 'blur', 'invalid', 'submit', 'pointercancel', 'popstate', 'pagehide', 'pageshow']) {
    assert.equal(getScrollBehavior({ type }), 'auto', type);
  }
});

test('listeners capture before app handlers, never cancel input, and fully clean up', () => {
  const attributes = new Map<string, string>();
  const listeners = new Map<string, EventListener>();
  const root = {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  };
  const target = {
    document: { documentElement: root },
    addEventListener(type: string, listener: EventListener, options: AddEventListenerOptions) {
      assert.deepEqual(options, { capture: true, passive: true });
      listeners.set(type, listener);
    },
    removeEventListener(type: string, listener: EventListener, capture: boolean) {
      assert.equal(capture, true);
      assert.equal(listeners.get(type), listener);
      listeners.delete(type);
    },
  } as unknown as Window;
  const cleanup = installScrollBehavior(target);
  const dispatch = (type: string, values = {}) => {
    const event = Object.assign(new Event(type, { cancelable: true }), values);
    assert.ok(listeners.has(type), type);
    listeners.get(type)!(event);
    assert.equal(event.defaultPrevented, false);
    return root.getAttribute('data-scroll-behavior');
  };

  assert.equal(root.getAttribute('data-scroll-behavior'), 'auto');
  for (const type of ['keydown', 'focus', 'blur', 'invalid', 'submit', 'pointercancel', 'popstate', 'pagehide', 'pageshow']) {
    assert.equal(dispatch('click', { detail: 1, button: 0 }), 'smooth');
    assert.equal(dispatch(type), 'auto');
  }
  assert.equal(dispatch('pointerdown', { button: 0, isPrimary: true }), 'smooth');
  assert.equal(dispatch('click', { detail: 0, button: 0 }), 'auto');
  assert.equal(listeners.has('wheel'), false);
  assert.equal(listeners.has('touchmove'), false);
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(root.getAttribute('data-scroll-behavior'), null);

  root.setAttribute('data-scroll-behavior', 'auto');
  installScrollBehavior(target)();
  assert.equal(root.getAttribute('data-scroll-behavior'), 'auto');
  assert.equal(listeners.size, 0);
});

test('CSS covers the root and every nested scroll container with live reduced-motion fallback', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /html, html \*\s*\{\s*scroll-behavior: auto;/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*html\[data-scroll-behavior="smooth"\], html\[data-scroll-behavior="smooth"\] \*\s*\{\s*scroll-behavior: smooth;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*scroll-behavior: auto !important;/);
});
