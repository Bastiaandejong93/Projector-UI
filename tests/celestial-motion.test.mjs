import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celestialMotionAt, rotateSkyPoint } from '../.test-build/celestial-motion.js';

test('the same sky rotates forward continuously as the Milky Way follows one arc', () => {
  let previousAngle=0, previousX=-Infinity;
  const points=[];
  for(let t=200_000;t<=452_000;t+=1_000){
    const motion=celestialMotionAt(t), point=rotateSkyPoint(-.5,-.15,motion.angle);
    assert.ok(motion.angle<=previousAngle+1e-12);
    assert.ok(point.x>=previousX-1e-12);
    previousAngle=motion.angle;previousX=point.x;points.push(point);
  }
  assert.ok(points[Math.floor(points.length/2)].y>points[0].y+.4);
  assert.ok(points[Math.floor(points.length/2)].y>points.at(-1).y+.3);
  assert.ok(celestialMotionAt(200_000).angle === 0);
  assert.equal(celestialMotionAt(452_000).angle,-1.8);
});

test('sky motion blends back only after the galactic pass, while clouds return', () => {
  assert.equal(celestialMotionAt(0).blend,0);
  assert.equal(celestialMotionAt(200_000).blend,1);
  assert.equal(celestialMotionAt(452_000).blend,1);
  assert.equal(celestialMotionAt(524_000).blend,1);
  assert.equal(celestialMotionAt(644_000).blend,0);
  for(let t=100;t<=652_000;t+=100){const a=celestialMotionAt(t-100),b=celestialMotionAt(t);assert.ok(Math.abs(a.angle-b.angle)<.001);assert.ok(Math.abs(a.blend-b.blend)<.0076)}
});
