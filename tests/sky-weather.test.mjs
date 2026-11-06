import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWeather, chooseWeather, advanceWeather, milkyPhase, canAddSkyEvent, lightningPulse, thunderBurst, thunderCluster, thunderPosition, weatherForMode} from '../.test-build/sky-weather.js';
import {CloudTexture} from '../.test-build/cloud-texture.js';
import {skyEventWeights, createWindFields} from '../.test-build/dream-sky.js';

test('random weather stays bounded and changes continuously, including palette wrap',()=>{
 let seed=123;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
 const current={...initialWeather};
 for(let i=0;i<1000;i++){
  const target=chooseWeather(random), before={...current};advanceWeather(current,target,250);
  assert.ok(target.amount>=.14&&target.amount<=.94);assert.ok(target.speed>=.85&&target.speed<=1.35);
  assert.equal(target.milkyWay,0); // phase clock controls the reveal
  assert.ok(target.storm<=target.amount);
  for(const key of Object.keys(current))assert.ok(Math.abs(current[key]-before[key])<.01);
 }
 current.palette=6.99;const target={...current,palette:.01};advanceWeather(current,target,250);assert.ok(current.palette>6.99);
});
test('scheduler never exceeds two events, duplicates or heavy kinds',()=>{
 const kinds=skyEventWeights.map(([kind])=>kind);
 for(const a of kinds)for(const b of kinds)for(const c of kinds)assert.equal(canAddSkyEvent([a,b],c),false);
 for(const kind of kinds)assert.equal(canAddSkyEvent([kind],kind),false);
 assert.equal(canAddSkyEvent(['thunder'],'meteor-shower'),false);
 assert.equal(canAddSkyEvent(['firefly'],'satellite'),true);
 assert.equal(canAddSkyEvent(['dust-drift'],'planet-glint'),true);
 assert.equal(canAddSkyEvent(['constellation'],'firefly'),false);
 assert.equal(canAddSkyEvent(['meteor'],'binary-star'),false);
 assert.equal(canAddSkyEvent(['meteor-shower'],'beacon'),false);
});
test('lightning has one to four bounded irregular pulses and expires',()=>{
 const counts=new Set();
 for(let seed=0;seed<100;seed++){
  let count=0,lit=false;
  for(let j=0;j<=1000;j++){const pulse=lightningPulse(j/1000,seed,0);assert.ok(pulse>=0&&pulse<=1);if(pulse>0&&!lit)count++;lit=pulse>0;}
  counts.add(count);assert.equal(lightningPulse(1,seed,2),0);
 }
 assert.deepEqual([...counts].sort(),[1,2,3,4]);
});
test('internal lightning follows cloud mask, stays local and remains dark',()=>{
 const sky=new CloudTexture(),fields=createWindFields();sky.render(fields,0,1);const anchor=sky.findCloud(12.45);assert.ok(anchor.density>.3);
 const flash={...anchor,radius:.13,strength:1};
 const before=sky.pixels.slice();sky.render(fields,0,1,initialWeather,[flash]);
 let changed=0;for(let i=0;i<before.length;i+=4){if(before[i]!==sky.pixels[i])changed++;assert.ok(sky.pixels[i]<=70);}
 assert.ok(changed>0&&changed/sky.density.length<.06);
 sky.render(fields,0,0);const clear=sky.pixels.slice();sky.render(fields,0,0,initialWeather,[flash]);assert.deepEqual(sky.pixels,clear);
});

test('Home varies through subdued natural cool hues and permits gentler storms',()=>{
 for(let i=0;i<100;i++){
  const weather=chooseWeather(()=>i/100),home=weatherForMode(weather,0),dream=weatherForMode(weather,1);
  assert.ok(home.palette>=4.55&&home.palette<=5.75);assert.ok(home.palette+home.colorSpread<=6);assert.equal(home.saturation,.35);
  assert.equal(home.storm,weather.storm*.55);assert.ok(home.speed<weather.speed);assert.ok(home.milkyWay<=weather.milkyWay+.08);
  for(const key of Object.keys(weather))assert.ok(Math.abs(dream[key]-weather[key])<1e-10);
  const next=weatherForMode(weather,.001);for(const key of Object.keys(home))assert.ok(Math.abs(next[key]-home[key])<.004);
 }
});

test('Home natural color range remains dark and varies without a palette seam',()=>{
 const sky=new CloudTexture(64,36),fields=createWindFields();let previous;const colors=new Set();
 for(let i=0;i<=70;i++){
  const home=weatherForMode({...initialWeather,palette:i/10},0);
  if(previous)assert.ok(Math.abs(home.palette-previous.palette)<.06);
  sky.render(fields,0,1,home);let maximum=0,total=0;
  for(let j=0;j<sky.pixels.length;j+=4){maximum=Math.max(maximum,...sky.pixels.slice(j,j+3));total+=sky.pixels[j]+sky.pixels[j+1]+sky.pixels[j+2];}
  assert.ok(maximum<=60);assert.ok(total/(64*36*3)<30);
  colors.add(sky.pixels.join(','));previous=home;
 }
 assert.ok(colors.size>20);
 assert.equal(weatherForMode({...initialWeather,palette:0},0).palette,weatherForMode({...initialWeather,palette:7},0).palette);
});

test('thunder cluster stays local and all echoes share its position',()=>{
 for(let seed=0;seed<500;seed++){
  const center={x:.2+(seed%5)*.13,y:.3},regions=thunderCluster(seed,center);
  assert.ok(regions.length>=1&&regions.length<=2);
  regions.forEach(p=>assert.ok(Math.hypot((p.x-center.x)*1.7778,p.y-center.y)<=.033));
  let previous;
  for(let frame=0;frame<=100;frame++){
   const anchor={...regions[0],windX:0,windY:0};const wind={x:frame*.003,y:frame*-.001};
   const p=thunderPosition(anchor,wind);
   assert.ok(Math.abs(p.x-center.x)<=.0120001&&Math.abs(p.y-center.y)<=.0100001);
   if(previous){assert.ok(p.x>=previous.x);assert.ok(p.y<=previous.y);assert.ok(Math.abs(p.x-previous.x)<=.003001);}
   previous=p;
  }
 }
});
test('one local pa-pa-pa discharge, irregular gaps and a long dark tail',()=>{
 const starts=new Set(),countTally=new Set();
 for(let seed=0;seed<500;seed++){
  const pulses=thunderBurst(seed);countTally.add(pulses.length);starts.add(pulses[0].start);
  assert.ok(pulses.length>=1&&pulses.length<=4);
  assert.equal(pulses[0].amplitude,1);
  const bigs=pulses.filter(p=>p.big);
  assert.ok(bigs.length<=1);
  if(bigs.length===1)assert.ok(bigs[0].amplitude>=.84);
  const end=p=>p.start+p.attack+p.decay+p.sustain+p.release;
  assert.ok(end(pulses[pulses.length-1])<=.65);
  const gaps=pulses.map((p,i)=>i===0?p.start:p.start-end(pulses[i-1]));
  for(let i=0;i<gaps.length;i++){
   assert.ok(gaps[i]>0);
   for(let j=i+1;j<gaps.length;j++)assert.ok(gaps[i]!==gaps[j],'gaps must stay irregular, never a periodic train');
  }
  for(let i=1;i<pulses.length;i++){assert.ok(pulses[i].amplitude>=.8&&pulses[i].amplitude<=1,'later pulses stay near full brightness');}
  for(let t=.7;t<=1;t+=.01){for(let cloud=0;cloud<3;cloud++)assert.equal(lightningPulse(t,seed,cloud),0);}
 }
 assert.ok(starts.size>450);assert.deepEqual([...countTally].sort(),[1,2,3,4]);
});
test('adjacent banks replay one delayed weaker discharge, never an alternating lobe',()=>{
 for(let seed=0;seed<400;seed++){
  const pulses=thunderBurst(seed),big=pulses.find(p=>p.big);
  if(!big){
   for(let j=0;j<=200;j++){assert.equal(lightningPulse(j/200,seed,1),0);assert.equal(lightningPulse(j/200,seed,2),0);}
   continue;
  }
  assert.equal(lightningPulse(big.start-.001,seed,1),0);
  assert.ok(lightningPulse(big.start+.05,seed,1)>0);
  let peak=0;for(let j=0;j<=1000;j++)peak=Math.max(peak,lightningPulse(j/1000,seed,1));
  assert.ok(peak>0&&peak<=.55);
 }
});
test('thunder never overlaps another event, other light events can still pair',()=>{
 for(const [kind]of skyEventWeights){assert.equal(canAddSkyEvent([kind],'thunder'),false);assert.equal(canAddSkyEvent(['thunder'],kind),false);}
 assert.equal(canAddSkyEvent(['binary-star'],'firefly'),true);
});

test('Dream phase clock allocates three quarters to cloudscapes',()=>{
 let galaxy=0; for(let minute=0;minute<48;minute++) galaxy+=milkyPhase(minute*60_000);
 assert.equal(galaxy,12); assert.equal(milkyPhase(48*60_000),0);
});


test('hybrid thunder has a short bounded quiet gap', async () => {
  const { hybridThunderWaitMs } = await import('../.test-build/sky-weather.js');
  assert.equal(hybridThunderWaitMs(0),8_000);
  assert.equal(hybridThunderWaitMs(.5),13_000);
  assert.equal(hybridThunderWaitMs(1),18_000);
});
