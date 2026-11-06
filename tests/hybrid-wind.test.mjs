import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceHybridHeading, advanceHybridWind, hybridVerticalOffset, HYBRID_HEADING_LIMIT, INITIAL_HYBRID_WIND, HYBRID_WIND_MIN, HYBRID_WIND_MAX } from '../.test-build/hybrid-wind.js';
test('wind stays downwind and changes speed with inertia', () => {
 let speed=INITIAL_HYBRID_WIND;
 for(let i=0;i<600;i++){const step=advanceHybridWind(speed,HYBRID_WIND_MAX,100);assert.ok(step.movement>0);assert.ok(step.speed>=speed&&step.speed<=HYBRID_WIND_MAX);speed=step.speed}
 assert.ok(speed<HYBRID_WIND_MAX-.001);
 assert.ok(HYBRID_WIND_MIN>0);
});

test('wind direction rotates slowly and vertical travel remains bounded', () => {
 let heading=0, travel=0;
 for(let i=0;i<3600;i++){
   const previous=heading;
   heading=advanceHybridHeading(heading,i<1800 ? HYBRID_HEADING_LIMIT : -HYBRID_HEADING_LIMIT,1000);
   assert.ok(Math.abs(heading-previous)<.0015);
   assert.ok(Math.abs(heading)<=HYBRID_HEADING_LIMIT);
   travel+=.02*Math.sin((heading+previous)/2);
   assert.ok(Math.abs(hybridVerticalOffset(travel))<=.025+1e-12);
 }
 assert.ok(heading<0);
});
test('the same wind travel is obtained at different frame cadences', () => {
 const once=advanceHybridWind(.02,.024,60000);let speed=.02,travel=0;
 for(let i=0;i<600;i++){const step=advanceHybridWind(speed,.024,100);speed=step.speed;travel+=step.movement}
 assert.ok(Math.abs(speed-once.speed)<1e-12);assert.ok(Math.abs(travel-once.movement)<1e-9);
 assert.throws(()=>advanceHybridWind(.02,-.01,10),RangeError);
});
