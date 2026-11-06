import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudTexture } from '../.test-build/cloud-texture.js';
import { initialWeather } from '../.test-build/sky-weather.js';
import { createWindFields, advanceWind } from '../.test-build/dream-sky.js';

test('main cloud raster visibly evolves in five seconds without events', () => {
 const sky=new CloudTexture(), fields=createWindFields();
 sky.render(fields,0,1); const before=sky.pixels.slice(), densityBefore=sky.density.slice();
 for(let i=0;i<100;i++) fields.forEach(f=>advanceWind(f,50));
 sky.render(fields,5,1);
 let changed=0,watched=0,total=0;
 // Open sky must stay dark and still; movement is judged inside cloud banks.
 for(let i=0;i<before.length;i+=4){
  const index=i/4, cloudy=Math.max(densityBefore[index]>.02,sky.density[index]>.02);
  if(cloudy)watched++;
  let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(before[i+c]-sky.pixels[i+c]); total+=delta/3;if(cloudy&&delta/3>3)changed++;
 }
 assert.ok(changed/Math.max(1,watched)>.40, 'movement must affect the actual cloud banks');
 const meanChange=total/Math.max(1,watched);
 assert.ok(meanChange>5, `visible motion inside the banks, got ${meanChange.toFixed(2)}`);
 const densityChange=sky.density.reduce((sum,d,i)=>sum+Math.abs(d-densityBefore[i]),0)/sky.density.length;
 assert.ok(densityChange>.01, "cloud structure changes independently of palette brightness");
});
test('frame evolution is continuous and cloudless sky has zero occlusion',()=>{
 const sky=new CloudTexture(),fields=createWindFields();sky.render(fields,0,1);const before=sky.pixels.slice();
 fields.forEach(f=>advanceWind(f,1000/30));sky.render(fields,1/30,1);
 let total=0;for(let i=0;i<before.length;i+=4)total+=Math.abs(before[i]-sky.pixels[i]);
 assert.ok(total/sky.density.length<2);
 sky.render(fields,1,0);assert.ok(sky.density.every(n=>n===0));
 // Cloudless means truly transparent: the photographic sky behind shows
 // through untouched, both via the coverage switch and via weather amount.
 for(let i=0;i<sky.pixels.length;i+=4)assert.equal(sky.pixels[i+3],0);
 sky.render(fields,1,1,{...initialWeather,amount:.14});
 for(let i=0;i<sky.pixels.length;i+=4)assert.equal(sky.pixels[i+3],0);
 assert.equal(sky.opacityAt(-1,2),0);
});

test('banks open genuinely: cloudless phases, moderate decks, temporary layering',()=>{
 const fields=createWindFields();
 const cloudy=weather=>{const sky=new CloudTexture();sky.render(fields,7,1,weather);let covered=0;
  for(let i=0;i<sky.density.length;i++)if(sky.density[i]>.04)covered++;
  return covered/sky.density.length;};
 const normal=cloudy({...initialWeather});
 // Round-2 spec 2026-11-03: variable coverage from cloudless to temporarily
 // layered. Typical weather may be fuller; heavy weather may cover the sky.
 assert.ok(normal>=.4&&normal<=.95,`normal weather coverage ${normal}`);
 assert.ok(cloudy({...initialWeather,amount:.14})<.005,'clear phases must be cloudless');
 assert.ok(cloudy({...initialWeather,amount:.22})<.02,'light weather leaves most of the sky open');
 const layered=cloudy({...initialWeather,amount:.88});
 assert.ok(layered>=.55&&layered<=1,`heavy layered coverage ${layered}`);
});
test('all palette phases remain dark even at full cloud coverage',()=>{
  const sky=new CloudTexture(),fields=createWindFields();
 for(const seconds of [0,90,240,480,720,1200,1680]) {
  sky.render(fields,seconds,1,{...initialWeather,palette:(seconds/240)%7});let sum=0,max=0;
  for(let i=0;i<sky.pixels.length;i+=4){const l=.2126*sky.pixels[i]+.7152*sky.pixels[i+1]+.0722*sky.pixels[i+2];sum+=l;max=Math.max(max,l);assert.ok(Math.max(...sky.pixels.subarray(i,i+3))<=70);}
  assert.ok(max<55);assert.ok(sum/sky.density.length<30);
 }
});

test('overlapping clouds continue at their own speeds without forced absorption', async () => {
 const {CloudMotion} = await import('../.test-build/cloud-motion.js');
 const motion = new CloudMotion(); motion.x[1] = .6; motion.x[5] = .45;
 motion.advance(0,0); const receiver = motion.x[1], small = motion.x[5];
 motion.advance(.01,.1);
 assert.ok(Math.abs(motion.x[1]-receiver-.01*motion.speed[1])<1e-9);
 assert.ok(Math.abs(motion.x[5]-small-.01*motion.speed[5])<1e-9);
 assert.ok(motion.x[5]>small && motion.x[5]<2.35);
});

test('a weather change cannot create an absent cloud within the viewport', async () => {
 const {CloudMotion} = await import('../.test-build/cloud-motion.js');
 const motion = new CloudMotion();
 motion.x[2] = .5;
 assert.equal(motion.allow(2,0,1.3),0);
 assert.equal(motion.allow(2,.8,1.3),.8);
 assert.ok(motion.x[2]<=-1.3, 'the newly active cloud must restart outside the viewport');
 motion.x[2] = -.8;
 assert.equal(motion.allow(2,.8,1.3),.8);
});

test('cloudy weather after a clear phase enters from outside the frame',()=>{
 const sky=new CloudTexture(64,36), fields=createWindFields();
 sky.render(fields,0,1,{...initialWeather,amount:.14});
 sky.render(fields,.1,1,{...initialWeather,amount:.9});
 assert.ok(sky.density.every(value=>value===0),'new clouds must not appear in the middle');
 for(let i=1;i<=120;i++) { fields.forEach(f=>f.x+=.02); sky.render(fields,.1+i*.1,1,{...initialWeather,amount:.9}); }
 assert.ok(sky.density.some(value=>value>.04),'clouds eventually enter from outside');
});

test('smooth wind changes move cloud positions without reversing the prevailing drift',async()=>{
 const {CloudMotion}=await import('../.test-build/cloud-motion.js');
 const m=new CloudMotion();m.advance(0,0,0);const x=m.x[1],y=m.y[1];
 m.advance(.01,.1,-.002);assert.ok(m.x[1]>x);assert.ok(Math.abs(m.y[1]-y)<.005);
 const prevX=m.x[1],prevY=m.y[1];m.advance(.02,.2,-.001);
 assert.ok(m.x[1]>prevX);assert.ok(Math.abs(m.y[1]-prevY)<.005);
});

test('recycling a bank across horizontal bounds keeps it outside the viewport', async () => {
 const {CloudMotion}=await import('../.test-build/cloud-motion.js');
 const motion=new CloudMotion(), sky=new CloudTexture(64,36,motion), fields=createWindFields();
 const weather={...initialWeather,amount:1};
 // Isolate each bank. Render immediately before and after the actual wrap,
 // including the largest weather-driven bank sizes.
 for(let bank=0;bank<8;bank++) {
  motion.x.fill(10); motion.x[bank]=2.34999;
  sky.render(fields,10+bank*2,1,weather);
  assert.ok(sky.density.every(value=>value===0),`bank ${bank} visible before wrap`);
  fields[0].x+=.002;
  sky.render(fields,11+bank*2,1,weather);
  assert.ok(motion.x[bank]<-1.3,`bank ${bank} did not wrap`);
  assert.ok(sky.density.every(value=>value===0),`bank ${bank} visible after wrap`);
 }
});

test('all visible banks share horizontal drift and never translate vertically', () => {
 const sky = new CloudTexture(64,36), fields = createWindFields();
 const weather = {...initialWeather, amount: 1};
 sky.render(fields, 0, 1, weather); const first = sky.geometry.map(b => ({...b}));
 fields[0].x += .01; sky.render(fields, 1, 1, weather);
 for (const bank of sky.geometry) { const previous = first.find(b => b.id === bank.id); assert.ok(bank.cx > previous.cx); assert.equal(bank.cy, previous.cy); }
});

test('stationary overlapping masks do not jump between frames', () => {
 const sky = new CloudTexture(96,54), fields = createWindFields();
 const weather = {...initialWeather, amount: 1};
 sky.render(fields, 0, 1, weather); const before = sky.density.slice();
 sky.render(fields, 1, 1, weather);
 for (let i = 0; i < before.length; i++) assert.ok(Math.abs(sky.density[i] - before[i]) < .02);
});

test('overlap masks and tints vary continuously under subpixel wind', () => {
 const sky = new CloudTexture(160,90), fields = createWindFields();
 const weather = {...initialWeather, amount: 1};
 const tint = (x,y) => [40 + 80*x, 30 + 40*y, 30];
 sky.render(fields,0,1,weather,[],undefined,tint);
 const before = sky.density.slice(), pixels = sky.pixels.slice();
 fields[0].x += .00001; sky.render(fields,1,1,weather,[],undefined,tint);
 for (let i=0; i<before.length; i++) {
  assert.ok(Math.abs(sky.density[i]-before[i]) < .01, `mask jump at ${i}`);
  if (pixels[i*4+3] > 10 && sky.pixels[i*4+3] > 10)
   for (let c=0;c<3;c++) assert.ok(Math.abs(pixels[i*4+c]-sky.pixels[i*4+c]) <= 5, `colour seam at ${i}`);
  if (i%160 !== 159) assert.ok(Math.abs(sky.density[i]-sky.density[i+1]) < .35, `mask edge at ${i}`);
 }
});

test('shared wind drives every bank in the same direction at every step', async () => {
 const {CloudMotion}=await import('../.test-build/cloud-motion.js');
 const m=new CloudMotion(); m.advance(0,0);
 for (let i=1; i<=100; i++) {
  const old=m.x.slice(); m.advance(i*.001,i,i*.01);
  for (let k=0;k<old.length;k++) { assert.ok(m.x[k]>old[k]); assert.equal(m.y[k],m.y[0]); }
 }
});

test('vapor travels faster with the shared wind and remains tethered to each body', async () => {
 const {CloudMotion} = await import('../.test-build/cloud-motion.js');
 const m = new CloudMotion(); m.advance(0,0);
 const body = m.x.slice(), vapor = m.vaporX.slice(); m.advance(.01,1);
 for (let i=0;i<body.length;i++) {
  assert.ok(m.speed[i]>0 && m.vaporSpeed[i]>m.speed[i]);
  assert.ok(m.vaporX[i]-vapor[i] > m.x[i]-body[i]);
 }
 assert.ok(m.speed[5]>m.speed[2], 'narrow background bank moves faster than wide foreground');
 m.advance(10,2);
 for (let i=0;i<body.length;i++) assert.ok(Math.abs(m.vaporX[i]-m.x[i])<=.080001);
});

test('independent vapor position changes sampled alpha without moving dense bodies', () => {
 const sky=new CloudTexture(96,54), fields=createWindFields(), weather={...initialWeather,amount:1};
 sky.render(fields,0,1,weather); const before=sky.pixels.slice(), density=sky.density.slice();
 for(let i=0;i<sky.motion.vaporX.length;i++) sky.motion.vaporX[i]+=.05;
 sky.render(fields,0,1,weather);
 let changed=0; for(let i=0;i<density.length;i++) {
  assert.equal(sky.density[i],density[i]);
  if(sky.pixels[i*4+3]!==before[i*4+3]) changed++;
 }
 assert.ok(changed>20, `vapor affects sampled alpha at ${changed} pixels`);
});

test('wind discontinuities are consumed in bounded continuous steps', async () => {
 const {CloudMotion}=await import('../.test-build/cloud-motion.js');
 const m=new CloudMotion(); m.advance(0,0); let previous=m.x.slice();
 m.advance(.05,1/30);
 for(let i=0;i<8;i++) assert.ok(m.x[i]-previous[i] <= .15/30*m.speed[i]+1e-10);
 for(let frame=2;frame<=12;frame++) {
  previous=m.x.slice(); m.advance(.05,frame/30);
  for(let i=0;i<8;i++) {
   const step=m.x[i]-previous[i];
   assert.ok(step>=-1e-10 && step<=.15/30*m.speed[i]+1e-10);
  }
 }
 assert.ok(Math.abs(m.x[2]-(.30+.05*m.speed[2]))<1e-9, 'deferred displacement eventually catches up');
});

test('local background palette controls cloud pixels across the viewport', () => {
 const fields=createWindFields(), weather={...initialWeather,amount:1};
 const render=flip=>{
  const sky=new CloudTexture(96,54);
  sky.render(fields,0,1,weather,[],undefined,(x)=>{
   const warm=(x<.5)!==flip; return warm ? [65,18,12] : [12,18,65];
  });
  return sky;
 };
 const a=render(false), b=render(true); let left=0,right=0,nl=0,nr=0;
 for(let y=0;y<54;y++) for(let x=0;x<96;x++) {
  const i=y*96+x; if(a.pixels[i*4+3]<25 || x>40&&x<56) continue;
  const delta=(a.pixels[i*4]-a.pixels[i*4+2])-(b.pixels[i*4]-b.pixels[i*4+2]);
  if(x<40){left+=delta;nl++;} else {right+=delta;nr++;}
 }
 assert.ok(nl>20&&nr>20); assert.ok(left/nl>8); assert.ok(right/nr< -8);
});
