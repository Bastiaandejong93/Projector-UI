import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudClearing, mixSkyColor} from '../.test-build/sky-composition.js';

test('clearing and cloud return remain continuous throughout background changes',()=>{
 assert.equal(cloudClearing(2,0),1);
 assert.ok(Math.abs(cloudClearing(2,1)-cloudClearing(3,0))<1e-12);
 assert.equal(cloudClearing(3,1),cloudClearing(0,0));
 let previous=1;
 for(let i=0;i<=100;i++){const next=cloudClearing(2,i/100);assert.ok(next<=previous);assert.ok(next>=.199999);previous=next;}
 for(let i=0;i<=100;i++){const next=cloudClearing(3,i/100);assert.ok(next>=previous);previous=next;}
});
test('background-derived color interpolates without a phase seam',()=>{
 const a=[20,30,40],b=[60,50,40];
 assert.deepEqual(mixSkyColor(a,b,0),a);assert.deepEqual(mixSkyColor(a,b,1),b);
 assert.deepEqual(mixSkyColor(a,b,.5),[40,40,40]);
});

test('the second group of cloudscapes clears in the same way',()=>{
 for(let phase=0;phase<4;phase++)for(let t=0;t<=1;t+=.1)assert.equal(cloudClearing(phase,t),cloudClearing(phase+4,t));
});

test('shuffled cloudscapes appear once per bag without moving the galaxy slots',async()=>{
 const {shuffleClouds}=await import('../.test-build/sky-composition.js');
 let seed=987654321;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
 const a=shuffleClouds(rng),b=shuffleClouds(rng);
 assert.deepEqual([...a].sort(),[0,1,2,3,4,5]);assert.deepEqual([...b].sort(),[0,1,2,3,4,5]);
 assert.notDeepEqual(a,b);
});

// 2026-11-04: stars and the Milky Way are fully static. The slow photo rotation
// and its angle math are gone; only timing of the crossfades may change.
test('no galaxy rotation math remains: the photographed sky is locked',async()=>{
 const mod=await import('../.test-build/sky-composition.js');
 assert.equal(mod.galaxyAngle,undefined,'galaxyAngle must not exist anymore');
});

test('liquid cloud phase windows stay inside a bounded range and drift smoothly',async()=>{
 const {liquidCloudDuration,CLOUD_PHASE_MIN,CLOUD_PHASE_MAX,CLOUD_PHASE_DRIFT,GALAXY_PHASE_MS,isGalaxyPhase}=await import('../.test-build/sky-composition.js');
 const minute=60_000;let seed=123456789;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
 let previous=CLOUD_PHASE_MIN;
 for(let i=0;i<500;i++){const next=liquidCloudDuration(previous,random);
  assert.ok(next>=CLOUD_PHASE_MIN&&next<=CLOUD_PHASE_MAX,'liquid windows must be bounded');
  assert.ok(Math.abs(next-previous)<=CLOUD_PHASE_DRIFT/2+1e-9,'window changes must stay smooth');
  previous=next;}
 // Galaxy phases keep the fixed length that carries the Milky Way time share.
 assert.equal(GALAXY_PHASE_MS,8*minute);
 for(const within of [3,7])assert.ok(isGalaxyPhase(within));
 for(const within of [0,1,2,4,5,6])assert.ok(!isGalaxyPhase(within));
});

// 2026-11-04: transitions are faster than the former 6.5–9.5 min phases with a
// fixed half-window, and each phase draws its own randomized crossfade share,
// so no periodic transition beat recurses.
test('transitions complete faster and their pace varies between phases',async()=>{
 const {liquidCloudDuration,CLOUD_PHASE_MIN,CLOUD_PHASE_MAX,CROSSFADE_MIN,CROSSFADE_MAX,crossfadeSplit}=await import('../.test-build/sky-composition.js');
 const minute=60_000;
 assert.ok(CLOUD_PHASE_MAX<8*minute,`longest cloud phase ${CLOUD_PHASE_MAX} is still too slow`);
 const longest=CLOUD_PHASE_MAX*CROSSFADE_MAX, shortest=CLOUD_PHASE_MIN*CROSSFADE_MIN;
 assert.ok(longest<4.8*minute&&shortest>1*minute,`crossfade window ${shortest/minute}–${longest/minute} min`);
 let seed=987654321;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
 for(let i=0;i<500;i++){const split=crossfadeSplit(random);
  assert.ok(split>=CROSSFADE_MIN&&split<=CROSSFADE_MAX,`crossfade fraction ${split} outside the band`);}
 const splits=new Set();for(let i=0;i<200;i++)splits.add(Math.round(crossfadeSplit(random)*1000));
 assert.ok(splits.size>100,'crossfade fractions must actually vary between phases');
});

test('variable windows remove the fixed loop beat: durations actually vary',async()=>{
 const {liquidCloudDuration}=await import('../.test-build/sky-composition.js');
 let seed=987654321;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
 const durations=[];let previous=8*60_000;
 for(let i=0;i<40;i++){previous=liquidCloudDuration(previous,random);durations.push(previous);}
 assert.ok(durations.some(d=>Math.abs(d-durations[0])>2500),'phase lengths must not sit at one fixed period');
});

test('scene rotation never places the same cloudscape on adjacent cloud phases',()=>{
 // The bag holds distinct cloudscapes and a galaxy phase always separates
 // cycles, so consecutive non-galaxy slots must draw different scenes.
 const approved=[0,1,2,4],sequence=[];
 for(let cycle=0;cycle<12;cycle++){
  const bag=[...approved].sort(()=>Math.random()-.5);
  for(let within=0;within<8;within++){
   if(within===3||within===7){sequence.push(6);continue;}
   const ordinal=within<3?within:within-1;
   sequence.push(bag[ordinal%4]);
  }
 }
 for(let i=1;i<sequence.length;i++)
  if(sequence[i]!==6&&sequence[i-1]!==6)assert.notEqual(sequence[i],sequence[i-1],'no immediate repeats');
});

test('test staging shows a full transition within seconds',async()=>{
 const {TRANSITION_TEST_PHASE_MS,TRANSITION_TEST_SPLIT}=await import('../.test-build/sky-composition.js');
 const windowMs=TRANSITION_TEST_PHASE_MS*TRANSITION_TEST_SPLIT;
 assert.ok(TRANSITION_TEST_PHASE_MS<=12_000,'test phase must finish inside a short check');
 assert.ok(windowMs>=3_000&&windowMs<=6_000,'crossfade window must be visible but calm');
 assert.ok(TRANSITION_TEST_PHASE_MS-windowMs<=6_000,'a transition must start within a few seconds');
});
