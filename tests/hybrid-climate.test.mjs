import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClimate, climateAt } from '../.test-build/hybrid-climate.js';
function seeded(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

test('weather follows the same schedule independent of sampling cadence', () => {
  const r1 = seeded(123), r2 = seeded(123), a = createClimate(r1), b = createClimate(r2);
  for (let time = 0; time <= 3 * 60 * 60_000; time += 1000) climateAt(a, time, r1);
  const sampled = climateAt(a, 3 * 60 * 60_000, r1);
  assert.deepEqual(sampled, climateAt(b, 3 * 60 * 60_000, r2));
  assert.deepEqual(a, b);
});

test('a forced rare clearing is gradual, delayed, and returns to clouds', () => {
  const random = () => 0, state = createClimate(random); let time = 0;
  for (let i = 0; i < 3; i++) { time = state.end; climateAt(state, time, random); }
  assert.equal(state.clearing, true);
  const opening = climateAt(state, time, random);
  assert.ok(opening.coverage > .7);
  assert.ok(climateAt(state, time + state.fade, random).coverage < .1);
  time = state.end;
  const closing = climateAt(state, time, random);
  assert.equal(state.clearing, false);
  assert.ok(closing.coverage < .1);
  assert.ok(climateAt(state, time + state.fade, random).coverage > .7);
});

test('moods retain bounded coverage, color and continuous handoffs over hours', () => {
  const random = seeded(81), state = createClimate(random); let previous = climateAt(state, 0, random);
  for (let t = 1000; t <= 8 * 60 * 60_000; t += 1000) {
    const next = climateAt(state, t, random);
    assert.ok(next.coverage >= .08 - 1e-9 && next.coverage <= 1);
    for (const key of ['red', 'green', 'blue']) assert.ok(next[key] >= .88 && next[key] <= 1.14);
    assert.ok(Math.abs(next.coverage - previous.coverage) < .02);
    previous = next;
  }
});

test('ordinary weather targets remain densely overcast', () => {
  const random = seeded(42), state = createClimate(random);
  for (let i = 0; i < 100; i++) {
    climateAt(state, state.end, random);
    if (!state.clearing) assert.ok(state.to.coverage >= .92 && state.to.coverage <= 1);
  }
});
