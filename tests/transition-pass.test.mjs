import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionMode, exitOffset, entryOffset, skyHandover, harmonyTone, harmonyStrength, fillCloudlessSky,
  SPRITE_TRAVEL, SKY_HANDOVER_START, HARMONY_CAP} from '../.test-build/transition-pass.js';

test('galaxy boundaries stay on the veiled crossfade, cloudscapes take the scene pass',()=>{
 assert.equal(transitionMode(9,0),'crossfade');
 assert.equal(transitionMode(2,9),'crossfade');
 assert.equal(transitionMode(1,4),'scene-pass');
});

test('sprite travel is endpoint-continuous so no white/black frame or pop occurs',()=>{
 assert.equal(exitOffset(0),0);
 assert.ok(Math.abs(entryOffset(1))<1e-12); // incoming masses land on their baked spots
 assert.ok(exitOffset(1)>=SPRITE_TRAVEL,'outgoing masses fully clear the wind side');
 assert.ok(entryOffset(0)>=SPRITE_TRAVEL,'incoming masses start fully off upwind');
});
test('mass drifts are monotonic and bounded',()=>{
 let previous=0;
 for(let i=0;i<=100;i++){const x=exitOffset(i/100);assert.ok(x>=previous&&x<=SPRITE_TRAVEL+.01);previous=x;}
 previous=SPRITE_TRAVEL;
 for(let i=0;i<=100;i++){const x=entryOffset(i/100);assert.ok(x<=previous+1e-9&&x>=0);previous=x;}
 // The outgoing exponent must guarantee full off-screen travel at blend 1.
 assert.ok(exitOffset(1)>=1.001);
});
test('sky plate handover is gentle, late, and never touches cloud pixels directly',()=>{
 assert.equal(skyHandover(SKY_HANDOVER_START),0);
 assert.equal(skyHandover(0),0);
 assert.equal(skyHandover(1),1);
 let previous=0;
 for(let i=0;i<=100;i++){const a=skyHandover(i/100);assert.ok(a>=previous-.01&&a<=1);previous=a;}
});

test('both handover sprites share one tone: the average of the two palettes',()=>{
 assert.deepEqual(harmonyTone([20,30,40],[60,70,80]),[40,50,60]);
 assert.deepEqual(harmonyTone([10,10,90],[50,20,10]),[30,15,50]);
 assert.deepEqual(harmonyTone([36,45,40],[42,39,48]),[39,42,44]);
});

test('harmonization vanishes at both endpoints, is capped, and stays continuous',()=>{
 assert.equal(harmonyStrength(0),0);
 assert.ok(Math.abs(harmonyStrength(1))<1e-12);
 assert.ok(Math.abs(harmonyStrength(-.1))===0&&Math.abs(harmonyStrength(1.1))===0);
 for(let i=0;i<=100;i++)assert.ok(harmonyStrength(i/100)<=HARMONY_CAP+1e-12,'strength stays restrained');
 let previous=0;
 for(let i=0;i<=100;i++){const s=harmonyStrength(i/100);assert.ok(Math.abs(s-previous)<.02);previous=s;}
});

test('cloudy plate regions inpaint to surrounding sky tones with no holes',()=>{
 const width=9,height=9,data=new Uint8ClampedArray(width*height*4),cloud=new Uint8Array(width*height);
 // Uniform sky ring over a solid cloud block in the centre.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,p=i*4;
  const cloudy=x>=2&&x<=6&&y>=3&&y<=6;
  data[p]=cloudy?200:36;data[p+1]=cloudy?170:42;data[p+2]=cloudy?120:53;
  cloud[i]=cloudy?255:0;
 }
 fillCloudlessSky(width,height,data,cloud);
 for(let i=0;i<width*height;i++){
  const r=data[i*4],g=data[i*4+1],b=data[i*4+2];
  assert.ok(Math.abs(r-36)<30&&Math.abs(g-42)<30&&Math.abs(b-53)<30,`cell ${i} must resample sky, saw ${r},${g},${b}`);
 }
});
test('a plate with no sky pixels anywhere keeps its photography instead of inventing black',()=>{
 const width=4,height=4,data=new Uint8ClampedArray(width*height*4),cloud=new Uint8Array(width*height);
 for(let i=0;i<width*height;i++){data[i*4]=200;data[i*4+1]=170;data[i*4+2]=120;cloud[i]=255;}
 fillCloudlessSky(width,height,data,cloud);
 for(let i=0;i<width*height;i++){
  const r=data[i*4],g=data[i*4+1],b=data[i*4+2];
  assert.ok(r===200&&g===170&&b===120,`cell ${i} must stay photographic, saw ${r},${g},${b}`);
 }
});
