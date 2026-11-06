import test from 'node:test';
import assert from 'node:assert/strict';
import { advectedParcel, BACKGROUND_ADVECTION_RATE } from '../.test-build/background-cloud-pass.js';
test('parcels move downwind and recycle only when invisible with constant total mass', () => {
  let previous = advectedParcel(0);
  for (let i = 1; i < 10000; i++) {
    const a = advectedParcel(i / 10000), b = advectedParcel(i / 10000, true);
    assert.ok(Math.abs(a.weight + b.weight - 1) < 1e-12);
    if (a.offset < previous.offset) assert.ok(a.weight < .00001 && previous.weight < .00001);
    else assert.ok(a.offset > previous.offset);
    previous = a;
  }
});
test('successive parcel handoffs vary their trajectory without changing total opacity', () => {
  const offsets = new Set();
  for (let cycle = 0; cycle < 20; cycle++) {
    const wind = (cycle + .3) / BACKGROUND_ADVECTION_RATE;
    const a = advectedParcel(wind), b = advectedParcel(wind, true);
    offsets.add(a.offset.toFixed(6));
    assert.ok(Math.abs(a.weight + b.weight - 1) < 1e-12);
  }
  assert.ok(offsets.size > 15);
});
