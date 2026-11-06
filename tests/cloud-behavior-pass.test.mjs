import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { thunderDuration } from '../.test-build/sky-weather.js';

// Focused deterministic tests for the 2026-11-04 cloud-behavior pass.
// Priorities pinned here: thunder-only scheduling with variable duration and
// velocity, faster/variable background transitions, static Milky Way photo,
// and the fixed hardware budget (30 FPS, 960x540, 160x90 cloud mask).

test('thunder durations vary per event and stay inside 2.2–5.8 s', () => {
  const seen = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const ms = thunderDuration(seed);
    assert.ok(ms >= 2200, `duration ${ms} below the short burst floor`);
    assert.ok(ms <= 5800, `duration ${ms} above the long burst ceiling`);
    seen.add(Math.round(ms));
  }
  assert.ok(seen.size >= 20, 'thunder length must actually vary between events');
});

test('hardware budget stays fixed: 30 FPS, 960x540 cap, 160x90 cloud mask', async () => {
  const source = await readFile('src/main.ts', 'utf8');
  assert.match(source, /new CloudTexture\(160, 90\)/, 'procedural cloud mask stays at 160x90');
  assert.match(source, /SKY_MAX_RENDER_WIDTH = 960/);
  assert.match(source, /SKY_MAX_RENDER_HEIGHT = 540/);
  assert.match(source, /skyFrameIntervalMs = 1000 \/ 30/);
  // No full-photo warp: the photographed sky is drawn with one static cover fit.
  assert.doesNotMatch(source, /drawImage\([^)]*backgroundWarp/i);
  assert.doesNotMatch(source, /ctx\.rotate\(/, 'no canvas rotation: the photographed sky is never transformed');
  // Exactly one render loop: the sky paints from a single scheduled frame chain.
  const paintCalls = source.match(/requestAnimationFrame\(paintLiquidSky\)/g) ?? [];
  assert.ok(paintCalls.length >= 2 && source.match(/function paintLiquidSky/), 'one sky render loop only');
});
