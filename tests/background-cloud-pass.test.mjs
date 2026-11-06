import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeCloudMasks, erodedAlpha, cloudErosion, cloudFlowOffset, BACKGROUND_CLOUD_FLOW, BACKGROUND_CLOUD_PHASE_SPEED } from '../.test-build/background-cloud-pass.js';

function image(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels[i * 4 + 3] = 255;
  return pixels;
}
function square(p, w, x, y, radius, value) {
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const i = ((y + dy) * w + x + dx) * 4; p[i] = p[i+1] = p[i+2] = value;
  }
}
test('masks select every broad cloud bank and reject isolated stars', () => {
  const w = 100, h = 100, p = image(w, h);
  square(p, w, 15, 15, 3, 100); // upper-left cloud
  square(p, w, 50, 25, 3, 100); // centre cloud volume
  square(p, w, 15, 70, 3, 100); // lower cloud bank
  square(p, w, 23, 15, 0, 255); // isolated star
  const { cloud, highlight } = makeCloudMasks(w, h, p);
  for (const i of [1515, 2550, 7015]) assert.ok(cloud[i] > 0, `broad cloud ${i} must animate`);
  assert.ok(highlight[1515] > 0);
  for (const i of [1523]) assert.equal(cloud[i] + highlight[i], 0);
  for (let i = 0; i < cloud.length; i++) {
    assert.ok(highlight[i] <= cloud[i]);
    if (!cloud[i]) assert.equal(erodedAlpha(cloud[i], .1, .1, 0, 0, 1, 0, 1), 0);
  }
});
test('erosion is bounded, continuous and advances downwind', () => {
  for (const c of [0, .2, .5, .8, 1]) for (const x of [.1, .5, .9]) {
    const a = cloudErosion(x, .2, 1, 0, 1, 0, c);
    assert.ok(a >= 0 && a <= 1);
    assert.ok(Math.abs(a - cloudErosion(x, .2, 1.00001, 0, 1, 0, c)) < .00004);
  }
  assert.ok(cloudErosion(.9,.2,0,0,1,0,.5) > cloudErosion(.1,.2,0,0,1,0,.5));
  assert.ok(cloudErosion(.1,.2,0,0,-1,0,.5) > cloudErosion(.9,.2,0,0,-1,0,.5));
  assert.equal(cloudErosion(.1,.2,0,0,1,0,1), 1);
});
test('background movement is projector-readable while remaining bounded and directional', () => {
  assert.ok(BACKGROUND_CLOUD_FLOW >= .04);
  assert.ok(BACKGROUND_CLOUD_PHASE_SPEED >= 8);
  const samples = Array.from({ length: 80 }, (_, i) => cloudErosion(.35, .2, i * .12, 0, 1, 0, .6));
  assert.ok(Math.max(...samples) - Math.min(...samples) > .12, 'background alpha must visibly evolve');
  for (let i = 1; i < samples.length; i++) assert.ok(samples[i] >= 0 && samples[i] <= 1);
});
test('local cloud flow moves real cloud content downwind without reversing', () => {
  let previous = cloudFlowOffset(.4, .2, 0, 0, 1, 0);
  let maxTravel = 0;
  for (let step = 1; step <= 240; step++) {
    const flow = cloudFlowOffset(.4, .2, step * .01, 0, 1, 0);
    // One travelling wave: bounded, continuous, and always upwind sample.
    assert.ok(flow.x >= 0 && flow.x <= BACKGROUND_CLOUD_FLOW);
    assert.ok(flow.y >= 0 && flow.y <= BACKGROUND_CLOUD_FLOW);
    assert.ok(flow.shade >= .88 && flow.shade <= 1);
    assert.ok(Math.abs(flow.x - previous.x) < .006, 'neighbouring frames may not jump');
    maxTravel = Math.max(maxTravel, flow.x);
    previous = flow;
  }
  assert.ok(maxTravel > .035, `cloud content must travel a visible distance, got ${maxTravel}`);
  // A neighbouring cell shares the phase, so a bank cannot split left/right.
  const a = cloudFlowOffset(.39, .2, 3, 0, 1, 0), b = cloudFlowOffset(.41, .2, 3, 0, 1, 0);
  assert.ok(Math.abs(a.x - b.x) < .01);
});
test('production moves only photographed cloud content and masks the flash by the displaced highlight', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  const pass = source.slice(source.indexOf('function drawBackgroundCloudPhase'), source.indexOf('let lightningCanvas'));
  assert.match(pass, /drawImage\(pass\.canvas, 0, 0, width, height\)/);
  assert.doesNotMatch(pass, /translate\s*\(|transform\s*\(|fillRect\s*\(/);
  // Gaps never show interpolated sky fill: the plate's own pixel stays, so
  // clouds cannot read as a lighter translucent smoke layer with drifting edges.
  assert.doesNotMatch(pass, /pass\.base/);
  assert.match(pass, /pass\.source\[p\]! \* shade/);
  const flash = source.slice(source.indexOf('function drawBackgroundLightning'), source.indexOf('function drawSkyCloudLayer'));
  assert.match(flash, /destination-in/);
  assert.match(flash, /backgroundThunderCanvases/);
  // Strict source: only the displaced photographic highlight. No procedural
  // foreground/cloud mask and no generic cloud-body canvas may host lightning.
  assert.doesNotMatch(flash, /cloudImageData|alphaCanvas/);
});
test('every active cloudscape gets its own cached pass and rotation never repeats adjacent slots', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /ACTIVE_CLOUDSCAPES\.includes\(index\)/);
  assert.match(source, /backgroundCloudPasses\[index\] =/);
  assert.match(source, /backgroundCloudPasses\[currentImage\]/);
  assert.match(source, /backgroundCloudPasses\[nextImageIndex\]/);
  const { cloudscapeOrdinal } = await import('../.test-build/sky-composition.js');
  assert.deepEqual([0, 1, 2, 4, 5, 6].map(cloudscapeOrdinal), [0, 1, 2, 3, 4, 5]);
});

test('inpainting never changes unmasked pixels or invents a black or white fallback', async () => {
  const { fillCloudlessSky } = await import('../.test-build/transition-pass.js');
  const w = 7, h = 7, p = image(w, h);
  for (let i = 0; i < w*h; i++) { p[i*4] = 30; p[i*4+1] = 40; p[i*4+2] = 50; }
  const original = new Uint8ClampedArray(p), mask = new Uint8Array(w*h); mask[24] = 255;
  p[24*4] = 100;
  fillCloudlessSky(w, h, p, mask, 1, 80);
  for (let i = 0; i < w*h; i++) {
    if (i !== 24) assert.deepEqual([...p.slice(i*4, i*4+4)], [...original.slice(i*4, i*4+4)]);
    assert.deepEqual([...p.slice(i*4, i*4+3)], [30, 40, 50]);
  }
  const noSky = new Uint8ClampedArray(original), all = new Uint8Array(w*h).fill(255);
  fillCloudlessSky(w, h, noSky, all, 1, 80);
  assert.deepEqual(noSky, original);
});
