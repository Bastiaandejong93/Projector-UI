import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useDreamMode } from '../.test-build/launch-mode.js';

test('a stale dream URL cannot start the native Home host as a screensaver', () => {
  assert.equal(useDreamMode('dream', false), false);
  assert.equal(useDreamMode(null, false), false);
  assert.equal(useDreamMode('dream', true), true);
  assert.equal(useDreamMode(null, true), false);
  assert.equal(useDreamMode('dream', undefined), true);
});
