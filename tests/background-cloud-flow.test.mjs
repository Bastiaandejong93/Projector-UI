import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundCloudFlow, drawBackgroundCloudFlow } from '../.test-build/transition-pass.js';

test('background flow is subtle and continuous for shared wind', () => {
  for (let i = 0; i < 3; i++) for (let t = -100; t < 100; t += .025) {
    const a = backgroundCloudFlow(t, i), b = backgroundCloudFlow(t + .025, i);
    assert.ok(Math.abs(a.x) <= .018 && a.opacity >= .075 - 1e-10 && a.opacity <= .125 + 1e-10);
    assert.ok(Math.abs(b.x - a.x) < .0001);
  }
});

test('flow draws only independent gradients, preserving plate and fixed vertical positions', () => {
  const render = wind => {
    const gradients = [], rectangles = [];
    const ctx = { save() {}, restore() {}, createRadialGradient(...args) { gradients.push(args); return { addColorStop() {} }; }, fillRect(...args) { rectangles.push(args); } };
    drawBackgroundCloudFlow(ctx, 960, 540, wind, [42, 40, 55], 1);
    return { gradients, rectangles };
  };
  const a = render(0), b = render(.1);
  assert.equal(a.gradients.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(a.gradients[i][1], b.gradients[i][1]);
    assert.ok(Math.abs(a.gradients[i][0] - b.gradients[i][0]) < 1);
    assert.equal(a.gradients[i][0], a.gradients[i][3]);
  }
});

test('equivalent wind trajectory gives same flow regardless of sampling cadence', () => {
  const elapsed = 10;
  const sample = step => { let t = 0; for (let i = 0; i < elapsed / step; i++) t += step; return backgroundCloudFlow(t * .012, 1); };
  assert.ok(Math.abs(sample(.1).x - sample(.05).x) < 1e-12);
});
