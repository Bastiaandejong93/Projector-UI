import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extraStars} from '../.test-build/star-field.js';

test('extra stars are fixed, subtle and bounded across repeated starts',()=>{
  const a=extraStars(960,540),b=extraStars(960,540);
  assert.deepEqual(a,b);
  assert.equal(a.length,220);
  assert.ok(a.every(s=>s.x>=1&&s.x<959&&s.y>=1&&s.y<539&&s.alpha>=.12&&s.alpha<.28));
  assert.ok(new Set(a.map(s=>`${s.x},${s.y}`)).size>210);
  assert.throws(()=>extraStars(0,0),RangeError);
});
