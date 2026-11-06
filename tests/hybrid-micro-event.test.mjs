import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MICRO_GLOW_DURATION, microGlowEnvelope, nextMicroGlowDelay } from '../.test-build/hybrid-micro-event.js';

test('the local glow rises and fades smoothly within a bounded interval', () => {
  assert.equal(microGlowEnvelope(-1), 0);
  assert.equal(microGlowEnvelope(0), 0);
  assert.equal(microGlowEnvelope(MICRO_GLOW_DURATION), 0);
  assert.equal(microGlowEnvelope(MICRO_GLOW_DURATION / 2), 1);
  for (let t = 0; t < MICRO_GLOW_DURATION; t += 100) {
    const value = microGlowEnvelope(t);
    assert.ok(value >= 0 && value <= 1);
    assert.ok(Math.abs(value - microGlowEnvelope(t + 100)) < .014);
  }
});

test('normal events stay separated by two to five minutes', () => {
  assert.equal(nextMicroGlowDelay(0), 120_000);
  assert.equal(nextMicroGlowDelay(1), 300_000);
});
