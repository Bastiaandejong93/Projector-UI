import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'docs/luna-cloudscape-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('new Luna cloudscape assets match manifest and HD 16:9 constraints', () => {
  for (const asset of manifest.assets) {
    const absolute = path.join(root, asset.file);
    const buffer = fs.readFileSync(absolute);
    assert.deepEqual(pngDimensions(buffer), { width: 1920, height: 1080 });
    assert.equal(asset.width, 1920);
    assert.equal(asset.height, 1080);
    assert.equal(buffer.length, asset.bytes);
    assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'), asset.sha256);
    assert.ok(buffer.length <= manifest.constraints.maxBytes, `${asset.file} exceeds size budget`);
  }
});

test('approved originals are protected and not listed as new assets', () => {
  const listed = new Set(manifest.assets.map((asset) => asset.file));
  for (const original of manifest.constraints.protectedApprovedOriginals) {
    assert.ok(fs.existsSync(path.join(root, original)), `${original} missing`);
    assert.equal(listed.has(original), false, `${original} must remain an approved original`);
  }
});
