import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { backgroundThunderAnchor, backgroundThunderAlpha, lightningPulse, canAddSkyEvent, thunderExposure } from '../.test-build/sky-weather.js';

test('thunder exposure softens peaks without suppressing weaker flickers', () => {
  assert.equal(thunderExposure(0, 1), 0);
  assert.equal(thunderExposure(1, 0), .82);
  assert.equal(thunderExposure(1, 1), .82);
  assert.ok(Math.abs(thunderExposure(.3, 1) - .36) < 1e-12);
  assert.ok(thunderExposure(.7, 1) >= .8);
});

test('thunder may start on its own but never shares a frame', () => {
  assert.equal(canAddSkyEvent([], 'thunder'), true);
  assert.equal(canAddSkyEvent(['thunder'], 'thunder'), false);
  for (const kind of ['meteor', 'firefly', 'satellite']) {
    assert.equal(canAddSkyEvent([kind], 'thunder'), false);
    assert.equal(canAddSkyEvent(['thunder'], kind), false);
  }
});
test('seeded storm finds a dense background cloud and masks its local pulse', () => {
  const mask = { width: 20, height: 10, alpha: new Uint8Array(200).fill(220) };
  const anchor = backgroundThunderAnchor(mask, 12.45, .7);
  assert.ok(anchor);
  assert.deepEqual(anchor, backgroundThunderAnchor(mask, 12.45, .7));
  const pulse = Math.max(...Array.from({ length: 1000 }, (_, i) => lightningPulse(i / 1000, 12.45, 0)));
  assert.ok(backgroundThunderAlpha(anchor.density, 1, pulse) > .2);
  assert.equal(backgroundThunderAlpha(0, 1, pulse), 0);
  assert.equal(backgroundThunderAnchor({ ...mask, alpha: new Uint8Array(200) }, 12.45, .7), null);
  assert.equal(backgroundThunderAnchor(mask, 12.45, 0), null);
});
test('softened anchor density finds dim but broad cloud highlights', () => {
  const dim = { width: 32, height: 18, alpha: new Uint8Array(32 * 18).fill(64) };
  const anchor = backgroundThunderAnchor(dim, 3.2, 1);
  assert.ok(anchor);
  assert.ok(anchor.density >= .22 && anchor.density < .35);
});
test('thunderTest schedules a visible discharge within five seconds', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /thunderTest \? 4_000/);
  assert.match(source, /nextSkyMicroEventAt = time \+ \(thunderTest \? 4_000 : thunderWaitMs/);
});

test('highlight mask rejects isolated stars and dark pixels', async () => {
  const { makeBackgroundLightningMask } = await import('../.test-build/sky-weather.js');
  const w = 9, h = 9, rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = 255;
  const set = (x, y, value) => { const i = (y * w + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = value; };
  set(1, 1, 255);
  for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) set(x, y, 100);
  const mask = makeBackgroundLightningMask(w, h, rgba);
  assert.equal(mask.alpha[10], 0);
  assert.equal(mask.alpha[2 * w + 2], 0);
  assert.ok(mask.alpha[5 * w + 5] > 0);
});
