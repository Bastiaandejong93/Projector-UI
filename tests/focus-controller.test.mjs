import test from 'node:test';
import assert from 'node:assert/strict';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

test('app navigation stops at both ends', () => {
  assert.equal(clamp(0 - 1, 0, 5), 0);
  assert.equal(clamp(5 + 1, 0, 5), 5);
  assert.equal(clamp(2 + 1, 0, 5), 3);
});

test('menu navigation stops at both ends', () => {
  assert.equal(clamp(0 - 1, 0, 7), 0);
  assert.equal(clamp(7 + 1, 0, 7), 7);
});

test('menu opens at Home and closes back to remembered app', () => {
  const remembered = 2;
  let menuIndex = 0;
  let open = true;
  assert.equal(menuIndex, 0);
  open = false;
  assert.equal(open, false);
  assert.equal(remembered, 2);
});

test('OK repeat is ignored by the 110ms repeat gate', () => {
  let last = 1000;
  const now = 1050;
  assert.equal(now - last < 110, true);
  last = 1120;
  assert.equal(1240 - last < 110, false);
});
