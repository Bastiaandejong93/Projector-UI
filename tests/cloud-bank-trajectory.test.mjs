import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBankTrack, advanceBankTrack, bankPositions } from '../.test-build/cloud-bank-trajectory.js';

test('the incoming bank becomes the same visible bank at the offscreen handoff', () => {
  const track = createBankTrack(0, 1);
  advanceBankTrack(track, .999999, 4, () => .4);
  const before = bankPositions(track), arriving = track.incoming;
  advanceBankTrack(track, .000002, 4, () => .4);
  const after = bankPositions(track);
  assert.equal(track.current, arriving);
  assert.ok(Math.abs(after.current - before.incoming) < .000003);
  assert.equal(track.previous, 0);
  assert.notEqual(track.incoming, track.current);
  assert.notEqual(track.incoming, track.previous);
});

test('many handoffs stay downwind and use valid, varied banks', () => {
  const track = createBankTrack(0, 1); let seed = 10; const seen = new Set();
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 5000; i++) {
    const oldCurrent = track.current, oldOffset = track.offset;
    advanceBankTrack(track, .003, 5, random);
    assert.ok(track.offset >= 0 && track.offset < 1);
    if (oldCurrent === track.current) assert.ok(track.offset >= oldOffset);
    assert.ok(track.current >= 0 && track.current < 5 && track.incoming >= 0 && track.incoming < 5);
    assert.notEqual(track.current, track.incoming); seen.add(track.current);
  }
  assert.ok(seen.size >= 4);
});

test('invalid track input is rejected', () => {
  assert.throws(() => createBankTrack(1, 1), RangeError);
  assert.throws(() => advanceBankTrack(createBankTrack(0, 1), -.1, 2, Math.random), RangeError);
});

test('three-bank tracks can select different successors instead of a fixed cycle', () => {
  const a = createBankTrack(0, 1), b = createBankTrack(0, 1);
  advanceBankTrack(a, 1, 3, () => 0);
  advanceBankTrack(b, 1, 3, () => .99);
  assert.notEqual(a.incoming, b.incoming);
});
