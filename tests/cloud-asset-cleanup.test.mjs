import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeIsolatedStars } from '../.test-build/cloud-asset-cleanup.js';

function field(width, height, value) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([value, value, value, 255], i * 4);
  return data;
}
function put(data, width, x, y, value) {
  const offset = (y * width + x) * 4;
  data.set([value, value, value], offset);
}

test('isolated bright star is removed while the dark cloud and alpha stay intact', () => {
  const input = field(11, 11, 12);
  put(input, 11, 5, 5, 110);
  const output = removeIsolatedStars(11, 11, input);
  assert.deepEqual([...output.slice((5 * 11 + 5) * 4, (5 * 11 + 5) * 4 + 4)], [12, 12, 12, 255]);
  assert.equal(input[(5 * 11 + 5) * 4], 110, 'source pixels must not be mutated');
  assert.equal(output[(3 * 11 + 3) * 4], 12);
});

test('connected cloud highlights and edges are not treated as isolated stars', () => {
  const input = field(11, 11, 20);
  for (let y = 3; y <= 7; y++) for (let x = 3; x <= 7; x++) put(input, 11, x, y, 80);
  assert.deepEqual(removeIsolatedStars(11, 11, input), input);
});

test('a compact multi-pixel star halo is removed as one component', () => {
  const input = field(13, 13, 12);
  for (const y of [6, 7]) for (const x of [6, 7]) put(input, 13, x, y, 90);
  const output = removeIsolatedStars(13, 13, input);
  for (const y of [6, 7]) for (const x of [6, 7]) assert.equal(output[(y * 13 + x) * 4], 12);
});

test('a bright star on a lighter cloud is removed without erasing a dark core', () => {
  const input = field(15, 15, 60);
  put(input, 15, 5, 5, 130);
  put(input, 15, 10, 10, 15);
  const output = removeIsolatedStars(15, 15, input);
  assert.equal(output[(5 * 15 + 5) * 4], 60);
  assert.equal(output[(10 * 15 + 10) * 4], 15);
});

test('dimensions are validated before image processing', () => {
  assert.throws(() => removeIsolatedStars(2, 2, new Uint8ClampedArray(15)), RangeError);
});
