import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLivingSchedule, advanceLivingSchedule } from '../.test-build/living-sky-schedule.js';

test('rare Milky Way begins and ends smoothly and is disabled without texture headroom', () => {
  const r=()=>0, s=createLivingSchedule(r);
  assert.equal(s.nextMilky, 30*60_000);
  assert.equal(advanceLivingSchedule(s,s.nextMilky,r,false,false).milky,null);
  const begin=advanceLivingSchedule(s,s.nextMilky,r,false,true);
  assert.equal(begin.milky.reveal,0);
  const start=s.milkyStart;
  assert.equal(advanceLivingSchedule(s,start+140_000,r,false,true).milky.reveal,1);
  assert.equal(advanceLivingSchedule(s,start+330_000,r,false,true).milky,null);
  assert.ok(s.nextMilky>=start+330_000+30*60_000);
});

test('one event at a time, with a quiet gap and no start during lightning', () => {
  const r=()=>0, s=createLivingSchedule(r);
  const at=s.nextEvent;
  assert.equal(advanceLivingSchedule(s,at,r,true,true).sky,null);
  assert.equal(advanceLivingSchedule(s,at+100,r,false,true).sky.kind,'twinkle');
  const started=s.event.start;
  assert.equal(advanceLivingSchedule(s,started+3_000,r,false,true).sky.kind,'twinkle');
  assert.equal(advanceLivingSchedule(s,started+6_000,r,false,true).sky,null);
  assert.ok(s.nextEvent>=started+6_000+75_000);
});

test('meteor and UFO can enter from either side with bounded height', () => {
  for (const kind of ['meteor','ufo']) for (const mirror of [false,true]) {
    const s=createLivingSchedule(()=>.5);s.nextEvent=0;
    const values=[kind==='meteor'?.25:.999, .99, mirror?0:.99];
    const random=()=>values.shift()??.5;
    const first=advanceLivingSchedule(s,0,random,false,true,true,30_000).sky;
    const later=advanceLivingSchedule(s,kind==='meteor'?3_100:9_000,()=>.5,false,true).sky;
    assert.equal(first.kind,kind);
    assert.equal(first.direction,mirror?-1:1);
    assert.ok(later.y>=.12&&later.y<=.9);
    assert.ok(mirror?later.x<first.x:later.x>first.x);
  }
});

test('additional event types are selected singly and wait for lightning', () => {
  for (const [roll,kind] of [[.60,'aircraft'],[.70,'comet'],[.78,'firefly'],[.87,'probe'],[.99,'meteor_shower'],[.95,'satellite_pair']]) {
    const s=createLivingSchedule(()=>.5);s.nextEvent=0;
    const r=()=>roll;
    assert.equal(advanceLivingSchedule(s,0,r,true,true).sky,null);
    assert.equal(advanceLivingSchedule(s,1,r,false,true,true,30_000).sky.kind,kind);
    assert.equal(advanceLivingSchedule(s,2001,r,false,true).sky.kind,kind);
  }
});

test('ten events have the intended weighted rarity', () => {
  const counts = new Map();
  for (let i=0;i<2000;i++) {
    const s=createLivingSchedule(()=>.5);s.nextEvent=0;
    const samples=[(i+.5)/2000,.5,.5];
    const result=advanceLivingSchedule(s,0,()=>samples.shift()??.5,false,true,true,30_000);
    counts.set(result.sky.kind,(counts.get(result.sky.kind)??0)+1);
  }
  assert.deepEqual(Object.fromEntries(counts),{twinkle:320,meteor:440,satellite:280,aircraft:240,comet:200,firefly:180,probe:160,satellite_pair:150,meteor_shower:20,ufo:10});
});

test('UFO and meteor shower only start with enough visible Milky Way time',()=>{
  for(const roll of [.99,.999]) {
    for(const available of [0,5_000]) {
      const s=createLivingSchedule(()=>.5);s.nextEvent=0;
      assert.equal(advanceLivingSchedule(s,1,()=>roll,false,true,true,available).sky,null);
      assert.ok(s.nextEvent>1);
    }
    const s=createLivingSchedule(()=>.5);s.nextEvent=0;
    const r=advanceLivingSchedule(s,1,()=>roll,false,true,true,30_000);
    assert.equal(r.sky.kind,roll===.99?'meteor_shower':'ufo');
  }
});
