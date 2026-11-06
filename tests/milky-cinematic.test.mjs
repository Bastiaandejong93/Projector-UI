import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CINEMATIC_CYCLE_MS, cinematicMilkyAt } from '../.test-build/milky-cinematic.js';
import { advanceLivingSchedule, createLivingSchedule } from '../.test-build/living-sky-schedule.js';

test('clouds clear before the stationary Milky Way merges and return after it fades', () => {
  assert.equal(CINEMATIC_CYCLE_MS,600_000);
  const at = cinematicMilkyAt;
  assert.equal(at(0).cloudRetreat,0);
  assert.equal(at(188_000).cloudRetreat,1);
  assert.equal(at(188_000).galaxy,0);
  assert.equal(at(284_000).galaxy,1);
  assert.equal(at(344_000).galaxy,1);
  assert.equal(at(440_000).galaxy,0);
  assert.equal(at(412_000).cloudRetreat,1);
  assert.ok(at(412_000).galaxy > .19 && at(412_000).galaxy < .22);
  assert.equal(at(592_000).cloudRetreat,0);
  for(let t=100;t<=CINEMATIC_CYCLE_MS;t+=100){const a=at(t-100),b=at(t);for(const k of ['cloudRetreat','galaxy'])assert.ok(Math.abs(a[k]-b[k])<.0038)}
});

test('cinematic clearings are rare and remain off without sufficient texture units', () => {
  const r=()=>0,s=createLivingSchedule(r,false,true);assert.equal(s.nextMilky,60*60_000);
  assert.equal(advanceLivingSchedule(s,s.nextMilky,r,false,false).cinematic,null);
  const start=advanceLivingSchedule(s,s.nextMilky,r,false,true);assert.deepEqual(start.cinematic,{cloudRetreat:0,cloudTravel:0,skyMatch:0,galaxy:0});
  const begin=s.milkyStart;assert.equal(advanceLivingSchedule(s,begin+284_000,r,false,true).cinematic.galaxy,1);
  assert.equal(advanceLivingSchedule(s,begin+CINEMATIC_CYCLE_MS,r,false,true).cinematic,null);
  assert.ok(s.nextMilky>=begin+CINEMATIC_CYCLE_MS+60*60_000);
});


test('both visible cloud passages move with the prevailing wind', () => {
  const at=cinematicMilkyAt;
  for (const [begin,end] of [[8_000,188_000],[412_000,592_000]]) {
    for(let t=begin+100;t<=end;t+=100) assert.ok(at(t).cloudTravel>=at(t-100).cloudTravel);
  }
  assert.ok(at(188_000).cloudTravel>=1.35);
  assert.ok(at(412_000).cloudTravel<=-1.35);
  assert.equal(at(592_000).cloudTravel,0);
});
