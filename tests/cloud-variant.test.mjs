import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformCloudAnchor } from '../.test-build/cloud-variant.js';

test('lightning anchors follow mirrored or rotated cloud features', () => {
  assert.deepEqual(transformCloudAnchor([.2, .3], 'mirror'), [.8, .3]);
  assert.deepEqual(transformCloudAnchor([.2, .3], 'rotate180'), [.8, .7]);
  assert.deepEqual(transformCloudAnchor(transformCloudAnchor([.25, .75], 'rotate180'), 'rotate180'), [.25, .75]);
});
