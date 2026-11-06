import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { drawStaticBackgroundTransition, spatialRevealAlpha, drawSpatialBackgroundTransition } from '../.test-build/transition-pass.js';

test('wind-directed reveal is continuous, monotonic and finishes everywhere', () => {
  for (const x of [0, .25, .5, .75, 1]) for (const direction of [-1, 1]) {
    let previous = 0;
    for (let i = 0; i <= 1000; i++) {
      const alpha = spatialRevealAlpha(x, i / 1000, direction);
      assert.ok(alpha >= previous - 1e-12 && alpha >= 0 && alpha <= 1);
      assert.ok(alpha - previous < .01);
      previous = alpha;
    }
    assert.equal(previous, 1);
    assert.equal(spatialRevealAlpha(x, 0, direction), 0);
  }
  // Positive wind carries the clearing front from the left (upwind) edge.
  assert.ok(spatialRevealAlpha(0, .5, 1) > spatialRevealAlpha(1, .5, 1));
  assert.ok(spatialRevealAlpha(1, .5, -1) > spatialRevealAlpha(0, .5, -1));
});

test('spatial reveal keeps the full current image if the next one is unavailable', () => {
  const a = { naturalWidth: 1920, naturalHeight: 1080, complete: true };
  const b = { naturalWidth: 0, naturalHeight: 0, complete: false }, calls = [];
  drawSpatialBackgroundTransition({ drawImage: (...args) => calls.push(args) }, a, b, 960, 540, .5, 1);
  assert.deepEqual(calls, [[a, 0, 0, 960, 540]]);
});

test('transition draws original images at fixed cover coordinates without transforms or intermediate canvases', () => {
  const a = { naturalWidth: 1920, naturalHeight: 1080 }, b = { naturalWidth: 1920, naturalHeight: 1080 };
  for (const blend of [0, .01, .5, .99, 1]) {
    const calls = [], stack = [];
    const ctx = { globalAlpha: 1, save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); },
      drawImage(...args) { calls.push({ args, alpha: this.globalAlpha }); } };
    drawStaticBackgroundTransition(ctx, a, b, 960, 540, blend);
    assert.equal(calls.length, blend === 0 || blend === 1 ? 1 : 2);
    for (const call of calls) {
      assert.ok(call.args[0] === a || call.args[0] === b);
      assert.deepEqual(call.args.slice(1), [0, 0, 960, 540]);
    }
    assert.equal(ctx.globalAlpha, 1);
    if (calls.length === 2) assert.equal(calls[1].alpha, blend);
  }
});

test('missing incoming image keeps the current original plate at full opacity', () => {
  const current = { naturalWidth: 1000, naturalHeight: 1000 }, missing = { naturalWidth: 0, naturalHeight: 0 }, calls = [];
  drawStaticBackgroundTransition({ drawImage: (...args) => calls.push(args) }, current, missing, 960, 540, 1);
  assert.deepEqual(calls, [[current, 0, -210, 960, 960]]);
});

test('production background path uses static helper and has no scene-pass canvases or warp', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  const path = source.slice(source.indexOf('function drawSkyCloudLayer'), source.indexOf('  // The live sky events', source.indexOf('function drawSkyCloudLayer')));
  assert.match(path, /drawStaticBackgroundTransition\(ctx, image, nextImage, width, height, blend\)/);
  assert.doesNotMatch(path, /translate\s*\(|transform\s*\(|warp|skyCloudSprites|skyClearPlates|drawImage\s*\(/i);
  assert.doesNotMatch(source, /skyCloudSprites|skyClearPlates|harmonizedSprite/);
});

test('incomplete next image cannot replace or blend the current plate', () => {
  const a = { naturalWidth: 1920, naturalHeight: 1080, complete: true };
  const b = { naturalWidth: 1920, naturalHeight: 1080, complete: false };
  for (const blend of [0, .5, 1]) {
    const calls = [];
    drawStaticBackgroundTransition({ drawImage: (...args) => calls.push(args) }, a, b, 960, 540, blend);
    assert.deepEqual(calls, [[a, 0, 0, 960, 540]]);
  }
});

test('transition helpers preserve initial visibility and resize frame', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /skyCanvas\.style\.visibility = 'hidden'/);
  assert.match(source, /presentationContext\.drawImage\(backCanvas/);
  assert.doesNotMatch(source, /replaceWith\(backCanvas\)/);
  const path = source.slice(source.indexOf('function drawSkyCloudLayer'), source.indexOf('  // The live sky events', source.indexOf('function drawSkyCloudLayer')));
  assert.doesNotMatch(path, /fillRect|clearRect|#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(path, /drawBackgroundCloudFlow|skyCloudSprites|skyClearPlates/);
});
