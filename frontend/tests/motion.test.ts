import assert from 'node:assert/strict';
import test from 'node:test';
import { canAnimate, runMotion } from '../lib/motion.ts';

function fakeElement() {
  const animation = { onfinish: null as (() => void) | null, oncancel: null as (() => void) | null, cancelCount: 0, cancel() { this.cancelCount++; this.oncancel?.(); } };
  const element = { animate: () => animation } as unknown as Pick<HTMLElement, 'animate'>;
  return { element, animation };
}

test('motion is pointer-only and disabled when reduced or hidden', () => {
  assert.equal(canAnimate(true, false, false), true);
  assert.equal(canAnimate(false, false, false), false);
  assert.equal(canAnimate(true, true, false), false);
  assert.equal(canAnimate(true, false, true), false);
});

test('motion completion runs exactly once and releases its animation', () => {
  const { element, animation } = fakeElement();
  let completed = 0;
  const handle = runMotion(element, [], { duration: 160 }, () => completed++);
  const staleFinish = animation.onfinish!;
  staleFinish();
  staleFinish();
  handle.finish();
  assert.equal(completed, 1);
  assert.equal(animation.cancelCount, 1);
});

test('interruption prevents a stale completion from closing a newer view', () => {
  const { element, animation } = fakeElement();
  let completed = 0;
  const handle = runMotion(element, [], { duration: 160 }, () => completed++);
  const staleFinish = animation.onfinish!;
  handle.cancel();
  staleFinish();
  handle.finish();
  assert.equal(completed, 0);
  assert.equal(animation.cancelCount, 1);
});

test('external cancellation settles the view instead of leaving it modal', () => {
  const { element, animation } = fakeElement();
  let completed = 0;
  runMotion(element, [], { duration: 160 }, () => completed++);
  animation.oncancel!();
  assert.equal(completed, 1);
});

test('missing animation support and zero duration complete synchronously', () => {
  let completed = 0;
  const element = { animate() { throw new Error('unsupported'); } } as unknown as Pick<HTMLElement, 'animate'>;
  runMotion(element, [], { duration: 160 }, () => completed++);
  runMotion(element, [], { duration: 0 }, () => completed++);
  assert.equal(completed, 2);
});

test('fallback settles a motion when its finish event is lost', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { element } = fakeElement();
  let completed = 0;
  runMotion(element, [], { duration: 160 }, () => completed++);
  context.mock.timers.tick(209);
  assert.equal(completed, 0);
  context.mock.timers.tick(1);
  assert.equal(completed, 1);
});

test('cancel clears the fallback timer', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { element } = fakeElement();
  let completed = 0;
  const handle = runMotion(element, [], { duration: 160 }, () => completed++);
  handle.cancel();
  context.mock.timers.tick(1000);
  assert.equal(completed, 0);
});
