import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWindFields, advanceWind, retargetWinds, cloudVisibility, cloudPosition, cloudEdgeOpacity, chooseSkyEvent, thunderClouds, thunderPulse } from '../.test-build/dream-sky.js';

// User direction 2026-11-04: every micro-event is disabled except thunder.
// The weight table survives for the pairing rules, but the chooser can no
// longer schedule anything else.
test('only thunder may be scheduled; all other micro-events are disabled', () => {
  const counts = new Set();
  for (let i = 0; i < 10000; i++) counts.add(chooseSkyEvent((i + .5) / 10000));
  counts.add(chooseSkyEvent(0)); counts.add(chooseSkyEvent(.9999));
  assert.deepEqual([...counts], ['thunder']);
});
test('wind retargets without moving or reversing, and settles over minutes', () => {
  for (const field of createWindFields()) {
    const before = { ...field };
    retargetWinds([field], 0, 1);
    assert.equal(field.x, before.x); assert.equal(field.vx, before.vx);
    advanceWind(field, 250);
    assert.ok(Math.abs(field.vx - before.vx) < .00001);
    for (let i = 0; i < 720; i++) advanceWind(field, 250);
    assert.ok(Math.abs(field.vx - field.targetVx) < Math.abs(before.vx - field.targetVx) * .38);
  }
});
test('independent wind trajectories are cadence invariant and resume is bounded', () => {
  const a = createWindFields(), b = createWindFields();
  retargetWinds(a, .8, .9); retargetWinds(b, .8, .9);
  for (let i = 0; i < 1200; i++) a.forEach(f => advanceWind(f, 50));
  for (let i = 0; i < 2400; i++) b.forEach(f => advanceWind(f, 25));
  a.forEach((f, i) => assert.ok(Math.abs(f.x - b[i].x) < 1e-10));
  assert.notEqual(a[0].x - b[0].targetVx, a[1].x - b[1].targetVx);
  const before = a[0].x; advanceWind(a[0], 600000); assert.ok(a[0].x - before < .006);
});
test('thunder has bounded cloud counts and two separated irregular ADSR pulses', () => {
  const counts = new Set();
  for (let seed = 0; seed < 100; seed++) {
    counts.add(thunderClouds(seed));
    for (let cloud = 0; cloud < thunderClouds(seed); cloud++) {
      assert.equal(thunderPulse(0, seed, cloud), 0);
      assert.equal(thunderPulse(1, seed, cloud), 0);
      let peaks = 0, rising = false;
      for (let i = 0; i <= 1000; i++) {
        const pulse = thunderPulse(i / 1000, seed, cloud);
        assert.ok(pulse >= 0 && pulse <= 1);
        if (pulse > 0 && !rising) peaks++;
        rising = pulse > 0;
      }
      assert.equal(peaks, 2);
    }
  }
  assert.deepEqual([...counts].sort(), [1, 2, 3]);
});
test('renderer shares one fixed canvas across Home and Dream without feature backdoors', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.equal((source.match(/<canvas\b/g) ?? []).length, 1);
  assert.doesNotMatch(source, /function drawSkyImage/);
  assert.match(source, /drawSkyCloudLayer\(width, height, time, elapsed\);/);
  assert.doesNotMatch(source, /drawSkyFeature|previewFeature|activeSkyFeature/);
  assert.match(source, /canAddSkyEvent\(activeSkyMicroEvents/);
  assert.doesNotMatch(source, /BackgroundWarp|shouldRenderWarp|skyFrame % 2/);
  assert.match(source, /Keep the photographic background and its stars completely static|The photographic background, its stars and the Milky Way band stay/);
  assert.doesNotMatch(source, /galaxyAngle/, 'the photographed sky must never be rotated or warped');
  assert.match(source, /skyFrameIntervalMs = 1000 \/ 30/);
  assert.doesNotMatch(source, /skyPaintCost|40 fps|fallback 30/);
  assert.match(source, /liquidCloudDuration\(lastSkyCloudDuration, Math\.random\)/);
  assert.match(source, /const transition = duration \* skyPhaseSplits\[slot\]/,
    'each phase must draw its own randomized crossfade window');
  assert.doesNotMatch(source, /transition = duration \* \.5/);
  assert.match(source, /thunderDuration\(seed\)/, 'thunder length varies per event');
  assert.match(source, /const kind = 'thunder';/, 'thunder is the only scheduled event');
  assert.doesNotMatch(source, /Math\.random\(\) < \.4 \? 'meteor'/, 'Home no longer schedules meteors');
  assert.match(source, /ctx\.globalAlpha = alphas\.mask/); // veil baseline, 0.32 at rest
  assert.match(source, /satellite: 9_000/);
  assert.match(source, /drawCloudDetail\(width, height, alphas\.detail, backgroundColor\)/);
  assert.match(source, /isGalaxyPhase\(within\) \? GALAXY_INDEX : bag\[cloudscapeOrdinal\(within\) % bag.length\]/);
  assert.doesNotMatch(source, /approvedCloudscapeIndices = \[0, 1, 2, 3, 4\]/);
  assert.match(source, /transitionTest \? TRANSITION_TEST_PHASE_MS/);
  assert.match(source, /ACTIVE_CLOUDSCAPES/);
  assert.match(readFileSync(new URL('../src/sky-weather.ts', import.meta.url), 'utf8'), /600_000/);
});
test('30fps produces uniform 60Hz pacing', () => {
  const frames = fps => {
    let last = 0; const paints = [];
    const interval = 1000 / fps;
    for (let i = 1; i <= 600; i++) {
      const time = i * 1000 / 60;
      if (time - last + .01 < interval) continue;
      last = time - ((time - last + .01) % interval) + .01;
      paints.push(i);
    }
    return new Set(paints.slice(1).map((n, i) => n - paints[i]));
  };
  assert.deepEqual([...frames(30)], [2]);
});

test('eight hours of extreme retargets preserve coherent bounded wind', () => {
  const fields = createWindFields();
  for (let step = 0; step < 8 * 3600 * 4; step++) {
    if (step % 720 === 0) retargetWinds(fields, step % 1440 === 0 ? 0 : 1, step % 2160 === 0 ? 0 : 1);
    fields.forEach(f => advanceWind(f, 250));
    const angles = fields.map(f => Math.atan2(f.vy, f.vx));
    assert.ok(Math.max(...angles) - Math.min(...angles) < .17);
    fields.forEach(f => { assert.ok(f.vx > 0); assert.ok(Math.hypot(f.vx, f.vy) < .021); assert.ok(Number.isFinite(f.x)); });
  }
});
test('cloud opacity and thunder gate follow actual eased image contribution', () => {
  assert.equal(cloudVisibility(0, 1, 1), 0);
  assert.equal(cloudVisibility(1, 0, 0), 0);
  assert.equal(cloudVisibility(1, 1, .5), 0);
  assert.equal(cloudVisibility(0, 2, .5), 1);
  assert.equal(cloudVisibility(0, 1, .5), .5);
  for (let i=0; i<=100; i++) assert.ok(Math.abs(cloudVisibility(0, 1, i/100)+cloudVisibility(1, 0, i/100)-1)<1e-12);
});

test('cloud and thunder anchors disappear continuously before wrapping', () => {
  for (let index=0; index<6; index++) {
    const field=createWindFields()[0];
    field.x = 1 - index * .39 - 1e-8;
    const before=cloudPosition(field,index);
    field.x += 2e-8;
    const after=cloudPosition(field,index);
    assert.ok(cloudEdgeOpacity(before.x) < 1e-6);
    assert.ok(cloudEdgeOpacity(after.x) < 1e-6);
  }
  assert.equal(cloudEdgeOpacity(.5),1);
});
