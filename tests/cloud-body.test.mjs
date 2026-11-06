import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CloudTexture } from '../.test-build/cloud-texture.js';
import { CloudMotion } from '../.test-build/cloud-motion.js';
import { initialWeather } from '../.test-build/sky-weather.js';
import { createWindFields, retargetWinds } from '../.test-build/dream-sky.js';

// User feedback 2026-11-04: much faster drift with a bounded retarget band.
test('retargeted wind stays inside the brisk cohesive band', () => {
  for (let direction = 0; direction <= 1; direction += 1) for (let speed = 0; speed <= 1; speed += 1) {
    const fields = createWindFields();
    retargetWinds(fields, direction, speed);
    for (const field of fields) {
      const magnitude = Math.hypot(field.targetVx, field.targetVy);
      assert.ok(magnitude >= .0115, `wind magnitude ${magnitude} below the faster band`);
      assert.ok(magnitude <= .0195, `wind magnitude ${magnitude} above the cohesive band`);
    }
  }
});

// Cloud banks share one heading, but the new pass pins the parallax law itself:
// narrower (background) banks ride the shared wind faster than wide, chunky
// foreground masses.
test('bank speeds obey the width parallax: wider banks move slower', async () => {
  const { bankWidths } = await import('../.test-build/cloud-motion.js');
  const motion = new CloudMotion();
  for (let i = 0; i < bankWidths.length; i++) for (let j = 0; j < bankWidths.length; j++) {
    if (bankWidths[i] < bankWidths[j]) assert.ok(motion.speed[i] > motion.speed[j],
      `a wider bank (index ${j}) must not outpace a background bank (index ${i})`);
  }
});

// Cloud banks must not scatter: their own speed factors share one narrow band.
test('bank speeds form a cohesive band but stay distinct', () => {
  const motion = new CloudMotion();
  const speeds = [...motion.speed];
  assert.equal(speeds.length, 8, 'eight banks ship');
  const min = Math.min(...speeds), max = Math.max(...speeds);
  assert.ok(max / min < 1.7, `speed spread ${max / min} makes banks scatter incoherently`);
  assert.ok(min > .7 && max < 1.3, 'every bank rides the shared wind at a comparable pace');
  assert.equal(new Set(speeds).size, speeds.length, 'banks keep individual paces');
});

// More visible clouds: moderate weather keeps most banks open at once.
test('moderate weather opens at least six of the eight banks', () => {
  const sky = new CloudTexture(), fields = createWindFields();
  sky.render(fields, 7, 1, initialWeather);
  const open = sky.geometry.length;
  assert.ok(open >= 6, `only ${open} banks visible at moderate weather`);
});

// Chunky bodies: the core is dense while the rim feathers out.
test('cloud cores read solid compared with their vapor rims', () => {
  const sky = new CloudTexture(), fields = createWindFields();
  sky.render(fields, 0, 1, initialWeather);
  assert.ok(sky.geometry.length >= 1);
  const bank = sky.geometry.reduce((best, b) => b.width * b.height > best.width * best.height ? b : best);
  let coreMax = 0, ringSum = 0, ringN = 0;
  for (let y = 0; y < sky.height; y++) for (let x = 0; x < sky.width; x++) {
    const dx = (x / sky.width - bank.cx) / bank.width, dy = (y / sky.height - bank.cy) / bank.height;
    const r = Math.sqrt(dx * dx + dy * dy);
    const d = sky.density[y * sky.width + x];
    if (r < .35) coreMax = Math.max(coreMax, d);
    if (r >= .95 && r <= 1.08) { ringSum += d; ringN++; }
  }
  const rim = ringSum / ringN;
  assert.ok(coreMax >= .5, `core density ${coreMax} too thin for chunky bodies`);
  assert.ok(coreMax >= rim * 1.7, `core ${coreMax} must clearly dominate the vapor rim mean ${rim}`);
});

// Stable core, deformable vapor edges: the core holds a dense floor even under
// noisy billow sampling, while the vapor rim thins all the way to nothing.
test('the core keeps a dense floor while the vapor rim thins away', () => {
  const sky = new CloudTexture(), fields = createWindFields();
  sky.render(fields, 0, 1, initialWeather);
  const bank = sky.geometry.reduce((best, b) => b.width * b.height > best.width * best.height ? b : best);
  let coreMin = 1, rimMin = 1;
  const core = [];
  for (let y = 0; y < sky.height; y++) for (let x = 0; x < sky.width; x++) {
    const dx = (x / sky.width - bank.cx) / bank.width, dy = (y / sky.height - bank.cy) / bank.height;
    const r = Math.sqrt(dx * dx + dy * dy);
    const d = sky.density[y * sky.width + x];
    if (r < .3) { coreMin = Math.min(coreMin, d); core.push(d); }
    if (r >= 1.01 && r <= 1.12 && d > 0) rimMin = Math.min(rimMin, d);
  }
  core.sort((a, b) => a - b);
  const coreMedian = core[core.length >> 1];
  // The median core must read as a solid body; rare noise dips are billows.
  assert.ok(coreMedian >= .55, `median core density ${coreMedian} too thin to read as chunky`);
  assert.ok(coreMedian >= rimMin * 3 + .25, `stable core ${coreMedian} must dominate the vapor rim ${rimMin}`);
});

test('cloud body color tracks the supplied background tint', () => {
  const fields = createWindFields();
  const render = color => {
    const sky = new CloudTexture(64, 36);
    sky.render(fields, 0, 1, initialWeather, [], color);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < sky.density.length; i++) if (sky.pixels[i * 4 + 3] > 100) {
      r += sky.pixels[i * 4]; g += sky.pixels[i * 4 + 1]; b += sky.pixels[i * 4 + 2]; n++;
    }
    assert.ok(n > 200, 'there must be solid cloud pixels to tint');
    return [r / n, g / n, b / n];
  };
  const blue = render([12, 16, 52]), red = render([56, 16, 14]);
  // Compare each tint against the other along the tint's own axis.
  assert.ok(red[0] > blue[0] + 8, 'warm background must warm the cloud body');
  assert.ok(blue[2] > red[2] + 8, 'cool background must cool the cloud body');
  assert.ok(Math.abs(blue[1] - red[1]) < 4, 'the shared green channel is untouched by either tint');
});

// Localized thunder pulses: the flash lifts dense pixels markedly but never
// touches open sky, and stays far below the hard 70 ceiling clamp.
test('thunder pulses visibly light cloud pixels while open sky stays untouched', () => {
  const sky = new CloudTexture(), fields = createWindFields();
  sky.render(fields, 0, 1, initialWeather);
  const anchor = sky.findCloud(12.45);
  assert.ok(anchor.density > .3, 'findCloud must locate a solid cluster reliably');
  const before = sky.pixels.slice();
  const flash = { x: anchor.x, y: anchor.y, radius: .13, strength: 1 };
  sky.render(fields, 0, 1, initialWeather, [flash]);
  let peakGain = 0;
  for (let i = 0; i < sky.density.length; i++) {
    if (sky.density[i] < .1) assert.deepEqual(sky.pixels.slice(i * 4, i * 4 + 4), before.slice(i * 4, i * 4 + 4));
    const gain = Math.max(sky.pixels[i * 4] - before[i * 4], sky.pixels[i * 4 + 2] - before[i * 4 + 2]);
    peakGain = Math.max(peakGain, gain);
  }
  assert.ok(peakGain >= 18, `pulse visible in the cloud mask, peak gain ${peakGain}`);
});

// Thunder reliability wiring lives in main.ts (not compiled for tests): the
// scheduler must retry quickly when no dense cluster exists yet, and the mask
// threshold must not silently swallow thunder under moderate weather.
test('main thunder scheduler retries quickly and keeps flashes cloud-local', async () => {
  const source = await readFile('src/main.ts', 'utf8');
  assert.match(source, /nextSkyMicroEventAt = time \+ 1_000/, 'thunder retries soon when no dense cloud exists');
  assert.match(source, /backgroundThunderAnchor\(mask, seed, 1\)/, 'anchors use background highlights');
  assert.match(source, /SKY_CLOUD_SPEED = 22/, 'surfaced drift speed is raised');
  assert.doesNotMatch(source, /Math\.random\(\) > renderedWeather\.storm/, 'storm must not gate Dream thunder probabilistically');
  // Every flash draw is masked by the live cloud alpha; no fullscreen flash path exists.
  assert.doesNotMatch(source, /globalCompositeOperation = ['"]screen['"];?\s*\n?\s*skyContext\.globalAlpha = 1;?\s*\n?\s*skyContext\.fillRect/);
  assert.match(source, /destination-in';\s*\n\s*const mask = backgroundThunderVisible \? backgroundThunderCanvases/);
  assert.match(source, /cloudTexture\.render\(skyMotion, cloudSeconds, clearing, renderedWeather, \[\]/);
});

test('foreground banks have multiple substantial sizes and dense central bodies', () => {
  const sky = new CloudTexture(320, 180), fields = createWindFields();
  sky.render(fields, 0, 1, {...initialWeather, amount: 1});
  const sizes = sky.geometry.map(b => b.width * b.height);
  assert.ok(new Set(sizes.map(v => v.toFixed(4))).size >= 6);
  assert.ok(Math.max(...sizes) / Math.min(...sizes) > 2.5);
  const bank = sky.geometry.reduce((a, b) => a.width * a.height > b.width * b.height ? a : b);
  let sum = 0, count = 0;
  for (let y = 0; y < sky.height; y++) for (let x = 0; x < sky.width; x++) {
    const dx = (x / sky.width - bank.cx) / bank.width, dy = (y / sky.height - bank.cy) / bank.height;
    if (dx * dx + dy * dy < .16) { sum += sky.density[y * sky.width + x]; count++; }
  }
  assert.ok(sum / count > .65, `mean core density ${sum / count}`);
});
