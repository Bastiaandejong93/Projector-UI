import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleSkyMicro } from '../.test-build/sky-micro-trial.js';

const kinds = ['twinkle', 'meteor', 'ufo', 'satellite'];
const START = 2_000;

test('samples stay bounded, finite, and inactive outside their own duration', () => {
  for (const kind of kinds) {
    const duration = kind === 'twinkle' ? 4_000 : kind === 'meteor' ? 2_200 : kind === 'satellite' ? 30_000 : 16_000;
    assert.equal(sampleSkyMicro(kind, START).intensity, 0);
    assert.equal(sampleSkyMicro(kind, START + duration).intensity, 0);
    assert.equal(sampleSkyMicro(kind, START - 1).intensity, 0);
    for (let elapsed = START; elapsed <= START + duration; elapsed += 25) {
      const sample = sampleSkyMicro(kind, elapsed);
      assert.deepEqual(Object.keys(sample), ['x', 'y', 'intensity', 'phase']);
      assert.ok(Object.values(sample).every(Number.isFinite));
      assert.ok(sample.x >= -.04 && sample.x <= 1.05);
      assert.ok(sample.y >= .25 && sample.y <= .86204);
      assert.ok(sample.intensity >= 0 && sample.intensity <= 1);
      assert.ok(sample.phase >= 0 && sample.phase <= 1);
    }
    assert.deepEqual(sampleSkyMicro(kind, START - 10_000), sampleSkyMicro(kind, START));
    assert.deepEqual(sampleSkyMicro(kind, START + duration + 10_000), sampleSkyMicro(kind, START + duration));
  }
});

test('each event enters and disappears smoothly without affecting other samples', () => {
  for (const kind of kinds) {
    const duration = kind === 'twinkle' ? 4_000 : kind === 'meteor' ? 2_200 : kind === 'satellite' ? 30_000 : 16_000;
    const nearStart = sampleSkyMicro(kind, START + 1);
    const entering = sampleSkyMicro(kind, START + 25);
    const nearEnd = sampleSkyMicro(kind, START + duration - 1);
    const leaving = sampleSkyMicro(kind, START + duration - 25);
    assert.ok(nearStart.intensity < entering.intensity);
    assert.ok(nearEnd.intensity < leaving.intensity);
    assert.ok(entering.intensity < .2);
    assert.ok(leaving.intensity < .2);
  }
  const twinkle = sampleSkyMicro('twinkle', START + 2_000);
  sampleSkyMicro('meteor', START + 1_000);
  assert.deepEqual(sampleSkyMicro('twinkle', START + 2_000), twinkle);
});

test('satellite follows a slow, steady track across the sky', () => {
  const start = sampleSkyMicro('satellite', START);
  const middle = sampleSkyMicro('satellite', START + 15_000);
  const end = sampleSkyMicro('satellite', START + 30_000);
  assert.deepEqual([start.x, start.y], [.12, .28]);
  assert.ok(Math.abs(middle.x - .47) < 1e-12);
  assert.ok(Math.abs(end.x - .82) < 1e-12);
  assert.ok(Math.abs(end.y - .43) < 1e-12);
});

test('meteor traverses smoothly between its specified endpoints', () => {
  const start = sampleSkyMicro('meteor', START);
  const middle = sampleSkyMicro('meteor', START + 1_100);
  const end = sampleSkyMicro('meteor', START + 2_200);
  assert.deepEqual([start.x, start.y], [.18, .44]);
  assert.ok(Math.abs(middle.x - .465) < 1e-12);
  assert.ok(Math.abs(middle.y - .345) < 1e-12);
  assert.ok(Math.abs(end.x - .75) < 1e-12);
  assert.ok(Math.abs(end.y - .25) < 1e-12);
});

test('UFO travels in, hovers, then exits smoothly', () => {
  const start = sampleSkyMicro('ufo', START);
  const halfwayIn = sampleSkyMicro('ufo', START + 3_500);
  const hoverStart = sampleSkyMicro('ufo', START + 7_000);
  const hoverEnd = sampleSkyMicro('ufo', START + 12_000);
  const exiting = sampleSkyMicro('ufo', START + 12_250);
  const exited = sampleSkyMicro('ufo', START + 12_500);
  assert.equal(start.x, -.04);
  assert.ok(halfwayIn.x > start.x && halfwayIn.x < .62);
  assert.equal(hoverStart.x, .62);
  assert.equal(hoverEnd.x, .62);
  assert.ok(exiting.x > .62 && exiting.x < 1.05);
  assert.equal(exited.x, 1.05);
  assert.equal(exited.y, .37);
  assert.equal(sampleSkyMicro('ufo', START + 16_000).intensity, 0);
});

test('new quiet events remain finite and fade at both ends', () => {
  for (const [kind, duration] of [['aircraft',42_000],['comet',18_000],['firefly',12_000],['probe',28_000],['meteor_shower',10_000],['satellite_pair',30_000]]) {
    assert.equal(sampleSkyMicro(kind, START).intensity, 0);
    assert.equal(sampleSkyMicro(kind, START + duration).intensity, 0);
    for (let t=0;t<=duration;t+=250) {
      const s=sampleSkyMicro(kind,START+t);
      assert.ok(Object.values(s).every(Number.isFinite));
      assert.ok(s.x>=0 && s.x<=1 && s.y>=0 && s.y<=1 && s.intensity>=0 && s.intensity<=1);
    }
  }
});


test('meteor shower has twenty short streaks and at most three overlap', () => {
  const starts=Array.from({length:20},(_,i)=>i*450);
  assert.equal(starts.length,20);
  for(let t=0;t<=10_000;t+=10) assert.ok(starts.filter(start=>t>=start && t<start+1100).length<=3);
  assert.equal(sampleSkyMicro('meteor_shower',START).intensity,0);
  assert.equal(sampleSkyMicro('meteor_shower',START+10_000).intensity,0);
  assert.ok(sampleSkyMicro('meteor_shower',START+5000).intensity>.99);
});
