import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { cloudscapeOrdinal, isGalaxyPhase } from '../.test-build/sky-composition.js';
import { thunderWaitMs } from '../.test-build/sky-weather.js';
test('production sequence remains defined over thousands of five-image cycles', () => {
  const source = readFileSync('src/main.ts', 'utf8');
  const bag = JSON.parse(source.match(/ACTIVE_CLOUDSCAPES: readonly number\[\] = (\[[^;]+\])/)[1]);
  const body = source.slice(source.indexOf('function backgroundAt('), source.indexOf('function backgroundColorAt('));
  const javascript = ts.transpile(body, { target: ts.ScriptTarget.ES2020 });
  const lookup = new Function('isGalaxyPhase', 'GALAXY_INDEX', 'cloudscapeBagFor', 'cloudscapeOrdinal', `${javascript}; return backgroundAt;`)(isGalaxyPhase, 9, () => bag, cloudscapeOrdinal);
  for (let slot = 0; slot < 8000; slot++) {
    const image = lookup(slot);
    assert.ok([...bag, 9].includes(image));
    if (isGalaxyPhase(slot)) assert.equal(image, 9);
    if (slot && image !== 9) assert.notEqual(image, lookup(slot - 1));
  }
});
test('normal thunder has breathing room between discharges', () => {
  for (let i = 0; i <= 100; i++) assert.ok(thunderWaitMs(i / 100) >= 22000 && thunderWaitMs(i / 100) <= 50000);
});
