import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWindFields, retargetWinds } from '../.test-build/dream-sky.js';

// Verify the render cadence is locked to a stable 30 FPS interval.
test('skyFrameIntervalMs is fixed at 1000/30 for stable 30 FPS', async () => {
  const src = await readFile('src/main.ts', 'utf8');
  const match = src.match(/let skyFrameIntervalMs\s*=\s*1000\s*\/\s*30/);
  assert.ok(match, 'skyFrameIntervalMs constant not found or altered');
});

// Ensure cloud wind remains predominantly horizontal with only tiny vertical drift.
test('retargetWinds produces coherent horizontal wind', () => {
  const fields = createWindFields();
  // Neutral direction and speed keep heading unchanged.
  retargetWinds(fields, 0.5, 0.5);
  for (const f of fields) {
    assert.ok(f.targetVx > 0, 'targetVx should be positive');
    assert.ok(Math.abs(f.targetVy / f.targetVx) < .09, `targetVy ratio ${f.targetVy / f.targetVx} too large`);
  }
});

test('cloud banks steer together smoothly and remain bounded', async () => {
  const { CloudMotion } = await import('../.test-build/cloud-motion.js');
  const motion = new CloudMotion();
  motion.advance(0, 0, 0);
  motion.advance(.001, 1 / 30, .01);
  const y = motion.y[0];
  assert.ok(y > 0 && y < .002);
  assert.ok(motion.y.every(value => value === y));
  motion.advance(.002, 2 / 30, 100);
  assert.ok(motion.y.every(value => Math.abs(value) <= .045));
});

test('shared steering is continuous, bounded, and independent of frame cadence', async () => {
  const { CloudMotion } = await import('../.test-build/cloud-motion.js');
  const simulate = fps => {
    const m = new CloudMotion(); m.advance(0, 0, 0);
    for (let i = 1; i <= fps * 8; i++) {
      const old = m.y[0], xs = m.x.slice();
      m.advance(i / fps * .001, i / fps, .4);
      assert.ok(Math.abs(m.y[0] - old) <= .045 * (1 - Math.exp(-1 / fps / 8)) + 1e-12);
      assert.ok(m.y.every(y => y === m.y[0] && Math.abs(y) <= .045));
      for (let k = 0; k < xs.length; k++) assert.ok(m.x[k] > xs[k]);
    }
    return m;
  };
  const a = simulate(30), b = simulate(60);
  assert.ok(Math.abs(a.y[0] - b.y[0]) < 1e-12);
  for (let k = 0; k < a.x.length; k++) assert.ok(Math.abs(a.x[k] - b.x[k]) < 1e-12);
});

test('retargeting eases the wind heading without opposing bank travel', async () => {
  const { advanceWind } = await import('../.test-build/dream-sky.js');
  const fields = createWindFields();
  retargetWinds(fields, 1, 1);
  const before = fields.map(f => [f.vx, f.vy]);
  for (const field of fields) advanceWind(field, 1000 / 30);
  fields.forEach((field, i) => {
    assert.ok(field.vx > 0 && field.targetVx > 0);
    assert.ok(Math.abs(field.vy - before[i][1]) < .00001);
    assert.ok(Math.abs(field.targetVy / field.targetVx) < .09);
  });
});
