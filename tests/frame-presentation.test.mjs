import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('sky rendering swaps a complete backbuffer and retains the last frame on failure', async () => {
  const source = await readFile('src/main.ts', 'utf8');
  const paint = source.slice(source.indexOf('function paintLiquidSky('), source.indexOf('function startSkyRendering('));
  assert.doesNotMatch(paint, /skyCanvas\.(width|height)\s*=/);
  assert.doesNotMatch(paint, /clearRect\(/);
  assert.match(paint, /backCanvas\.width = renderWidth/);
  assert.doesNotMatch(paint, /replaceWith/);
  assert.match(paint, /presentationContext\.drawImage\(backCanvas/);
  assert.match(paint, /catch \(error\)[\s\S]*skyBackgroundElapsed = lastGoodElapsed/);
  assert.match(source, /FOREGROUND_CLOUDS_ENABLED = false/);
  assert.match(source, /thunderTest \? 4_000/);
});
