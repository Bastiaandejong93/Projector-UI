import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MILKY_TRIAL_CYCLE_MS, milkyPreviewAt } from '../.test-build/hybrid-milky-trial.js';

test('preview clears gradually and returns to the same cloudy state', () => {
  assert.deepEqual(milkyPreviewAt(0), { coverage: .96, reveal: 0 });
  assert.equal(MILKY_TRIAL_CYCLE_MS, 330_000);
  assert.ok(milkyPreviewAt(130_000).coverage < .081);
  assert.equal(milkyPreviewAt(130_000).reveal, 1);
  assert.deepEqual(milkyPreviewAt(MILKY_TRIAL_CYCLE_MS), milkyPreviewAt(0));
  for (let t = 100; t <= MILKY_TRIAL_CYCLE_MS; t += 100) {
    const a = milkyPreviewAt(t - 100), b = milkyPreviewAt(t);
    assert.ok(Math.abs(a.coverage - b.coverage) < .002);
    assert.ok(Math.abs(a.reveal - b.reveal) < .002);
  }
});
