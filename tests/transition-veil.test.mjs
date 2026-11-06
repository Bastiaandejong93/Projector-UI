import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionVeil, veilWeight, veilAlphas} from '../.test-build/transition-veil.js';

test('transition veil vanishes exactly at both crossfade endpoints and peaks mid-blend',()=>{
  assert.equal(transitionVeil(0),0);
  assert.equal(transitionVeil(1),0);
  for(const b of [-0.05,1.05])assert.ok(Math.abs(transitionVeil(b))<1e-12);
  assert.ok(Math.abs(transitionVeil(.5)-1)<1e-12);
});
test('veil continuity: no jump where a transition ends and the next begins',()=>{
  let previous=transitionVeil(1);
  for(let i=0;i<=200;i++){const next=transitionVeil(i/200);assert.ok(Math.abs(next-previous)<.02);previous=next;}
  // Symmetric bell, so the outgoing half of any crossfade matches the incoming half.
  for(let i=0;i<=100;i++)assert.ok(Math.abs(transitionVeil(i/100)-transitionVeil(1-i/100))<1e-12);
});
test('veil is capped by the clearing schedule so the Milky Way keeps its open sky',()=>{
  const clearingPhase3 = t=>Math.min(1,Math.max(0,.2+.8*t));
  for(let i=0;i<=100;i++){const t=i/100;assert.ok(veilWeight(t,clearingPhase3(t))<=transitionVeil(t)+1e-12);
    // peak at t=.5 must shrink with clearing .6 in the galaxy phases
    if(i===50)assert.ok(Math.abs(veilWeight(t,clearingPhase3(t))-veilWeight(t,1)*clearingPhase3(t))<1e-12);}
  assert.equal(veilWeight(.5,0),0);
  assert.equal(veilWeight(.5,1),1);
  assert.ok(veilWeight(-1,1)===0&&veilWeight(2,1)===0);
});
test('draw opacities stay restrained and return to the fixed baseline at the endpoints',()=>{
  const rest=veilAlphas(0);
  assert.equal(rest.mask,.32);assert.equal(rest.detail,.42);
  const peak=veilAlphas(1);
  assert.ok(peak.mask>.32&&peak.mask<=.6&&peak.detail>.42&&peak.detail<=.68);
  for(const clearing of [0,.5,1])for(let i=0;i<=100;i++){
    const {mask,detail}=veilAlphas(veilWeight(i/100,clearing));
    assert.ok(mask>=.32&&mask<=.6&&detail>=.42&&detail<=.68);
  }
});
