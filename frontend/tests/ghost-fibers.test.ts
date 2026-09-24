import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDpr, normalizeFps, finite, normalizeLayers, mayAnimate, frameDue, hexToRgb } from '../lib/ghost-fibers.ts';

test('DPR defaults to one, caps at 1.5 and rejects nonfinite values', () => {
  for (const value of [undefined, NaN, Infinity, -Infinity]) assert.equal(normalizeDpr(value), 1);
  assert.equal(normalizeDpr(3), 1.5);
  assert.equal(normalizeDpr(0), 0.5);
  assert.equal(normalizeDpr(-1), 0.5);
  assert.equal(normalizeDpr(1.25), 1.25);
});
test('FPS defaults to 30 with finite bounded scheduling', () => {
  for (const value of [undefined, NaN, Infinity, -Infinity]) assert.equal(normalizeFps(value), 30);
  assert.equal(normalizeFps(0), 1);
  assert.equal(normalizeFps(-30), 1);
  assert.equal(normalizeFps(300), 120);
  assert.equal(normalizeFps(24), 24);
});
test('every lifecycle gate must permit work, including import resolution', () => {
  const enabled = { visible: true, hidden: false, reduced: false, paused: false, disposed: false, failed: false };
  assert.equal(mayAnimate(enabled), true);
  assert.equal(mayAnimate({ ...enabled, visible: false }), false);
  for (const key of ['hidden', 'reduced', 'paused', 'disposed', 'failed'] as const) {
    assert.equal(mayAnimate({ ...enabled, [key]: true }), false, key);
  }
});
test('frame scheduling respects the actual FPS without early frames', () => {
  assert.equal(frameDue(0, 0, 30), false);
  assert.equal(frameDue(16, 0, 30), false);
  assert.equal(frameDue(33, 0, 30), false);
  assert.equal(frameDue(34, 0, 30), true);
  assert.equal(frameDue(34, 0, NaN), true);
  assert.equal(frameDue(NaN, 0, 30), false);
  assert.equal(frameDue(100, Infinity, 30), false);
});
test('shader inputs retain finite values and layers match source bounds', () => {
  assert.equal(finite(NaN, 0.2), 0.2);
  assert.equal(finite(Infinity, 2), 2);
  assert.equal(finite(-0.2, 1), -0.2);
  assert.equal(normalizeLayers(NaN), 4);
  assert.equal(normalizeLayers(4.6), 5);
  assert.equal(normalizeLayers(-1), 1);
  assert.equal(normalizeLayers(100), 10);
});
test('source color parsing supports shorthand and safe malformed fallback', () => {
  assert.deepEqual(hexToRgb(' #f0a '), [1, 0, 170 / 255]);
  assert.deepEqual(hexToRgb('#140E35'), [20 / 255, 14 / 255, 53 / 255]);
  assert.deepEqual(hexToRgb('invalid'), [1, 1, 1]);
});
