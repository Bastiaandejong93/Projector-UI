import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCloudClearing,advanceCloudClearing} from '../.test-build/cloud-clearing.js';

test('the Milky Way overlaps the last outgoing clouds and the first returning clouds',()=>{
  const s=createCloudClearing(10);
  let v=advanceCloudClearing(s,11.99,500_000);assert.equal(v.mode,1);assert.equal(v.reveal,0);assert.equal(s.clearAt,null);
  v=advanceCloudClearing(s,12.01,500_000);assert.equal(s.clearAt,500_000);assert.equal(v.reveal,0);
  v=advanceCloudClearing(s,12.2,524_000);assert.ok(v.reveal>0);assert.equal(v.mode,1);
  v=advanceCloudClearing(s,13.3,596_000);assert.equal(v.reveal,1);
  v=advanceCloudClearing(s,14,723_999);assert.equal(v.mode,1);
  v=advanceCloudClearing(s,14,724_000);assert.ok(v.reveal>.19 && v.reveal<.22);assert.equal(v.mode,2);assert.equal(v.refill,0);
  v=advanceCloudClearing(s,16.9,800_000);assert.equal(v.mode,2);
  v=advanceCloudClearing(s,17.21,801_000);assert.equal(v.done,true);assert.equal(v.mode,0);
});

test('return waits for the slowest clouds to clear even if time advances',()=>{
  const s=createCloudClearing(0);advanceCloudClearing(s,2.01,0);
  const v=advanceCloudClearing(s,2.1,300_000);assert.equal(v.mode,1);assert.equal(s.refillWind,null);
});

test('rare-event window requires a visible Milky Way and reports remaining time',()=>{
  const s=createCloudClearing(0);
  let v=advanceCloudClearing(s,2.01,0);assert.equal(v.rareWindowMs,0);
  v=advanceCloudClearing(s,3.3,48_000);assert.ok(v.reveal>=.2);assert.equal(v.rareWindowMs,204_000);
  v=advanceCloudClearing(s,4,251_999);assert.equal(v.rareWindowMs,0);
});
