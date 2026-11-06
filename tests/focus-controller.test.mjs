import test from 'node:test';
import assert from 'node:assert/strict';
import { createFocusController, createKeyboardInput } from '../.test-build/focus-controller.js';
import { systemItems } from '../.test-build/menu-items.js';

const exitIndex = systemItems.length;
const allAppsCount = 13;
const create = (initial = 2) => createFocusController(6, allAppsCount, systemItems.length, initial);
const actions = (controller, ...sequence) => sequence.map(action => controller.handle(action));

test('app boundaries clamp and quick direction changes are processed immediately', () => {
  const c = create(0);
  c.handle('left');
  assert.equal(c.state.appIndex, 0);
  for (let i = 0; i < 10; i++) c.handle('right');
  assert.equal(c.state.appIndex, 5);
  actions(c, 'left', 'right', 'left');
  assert.equal(c.state.appIndex, 4);
  assert.deepEqual(c.handle('ok'), { type: 'app', index: 4 });
});

test('the carousel opens only the system drawer above it', () => {
  const c = create(4);
  c.handle('up');
  assert.equal(c.state.zone, 'system-trigger');
  c.handle('down');
  assert.equal(c.state.zone, 'apps');
  assert.equal(c.state.appIndex, 4);
  actions(c, 'up', 'ok');
  assert.equal(c.state.zone, 'system');
  assert.equal(c.state.systemIndex, 0);
  assert.equal(systemItems[c.state.systemIndex].destination, 'settings');
});

test('All Apps is a system-drawer destination, never a stock navigation handoff', () => {
  const c = create();
  actions(c, 'up', 'ok', 'down', 'down', 'down');
  assert.equal(systemItems[c.state.systemIndex].label, 'All Apps');
  assert.deepEqual(c.handle('ok'), { type: 'system', index: 3 });
  assert.equal(systemItems.some(item => item.label === 'Home Apps'), false);
});

test('Home Apps is reached from the All Apps page, not from the drawer', () => {
  const c = create();
  c.focus('all-apps', 0);
  c.handle('up');
  assert.equal(c.state.zone, 'all-apps-trigger');
  c.handle('ok');
  assert.equal(c.state.zone, 'home-apps');
  c.handle('up');
  assert.equal(c.state.zone, 'home-apps-trigger');
  c.handle('ok');
  assert.equal(c.state.zone, 'all-apps');
});

test('the All Apps grid moves by row and Back returns to Luna', () => {
  const c = create();
  c.focus('all-apps', 0);
  actions(c, 'right', 'right', 'down');
  assert.equal(c.state.allAppsIndex, 8);
  assert.deepEqual(c.handle('ok'), { type: 'all-app', index: 8 });
  c.handle('back');
  assert.equal(c.state.zone, 'apps');
  assert.equal(c.state.appIndex, 2);
});

test('Home Apps uses the same grid and toggles a selected app without leaving Luna', () => {
  const c = create();
  c.focus('home-apps', 0);
  actions(c, 'right', 'down');
  assert.equal(c.state.homeAppsIndex, 7);
  assert.deepEqual(c.handle('ok'), { type: 'home-app', index: 7 });
  c.handle('back');
  assert.equal(c.state.zone, 'apps');
});

test('the home carousel count can change after a Home Apps selection', () => {
  const c = create();
  c.focus('apps', 5);
  c.setAppCount(3);
  assert.equal(c.state.appIndex, 2);
  assert.deepEqual(c.handle('ok'), { type: 'app', index: 2 });
});

test('Spotify controls are reached from Home and keep D-pad focus', () => {
  const c = createFocusController(6, allAppsCount, systemItems.length, 2, 4);
  c.handle('down');
  assert.equal(c.state.zone, 'spotify');
  assert.equal(c.state.spotifyIndex, 1);
  c.handle('right');
  assert.equal(c.state.spotifyIndex, 2);
  assert.deepEqual(c.handle('ok'), { type: 'spotify', index: 2 });
  c.setSpotifyCount(0);
  assert.equal(c.state.zone, 'apps');
});

test('All Apps grid stays within its first and final items', () => {
  const c = create();
  c.focus('all-apps', 0);
  c.handle('left');
  assert.equal(c.state.allAppsIndex, 0);
  c.focus('all-apps', allAppsCount - 1);
  c.handle('right');
  assert.equal(c.state.allAppsIndex, allAppsCount - 1);
});

test('drawer includes the exit in the same D-pad route', () => {
  const c = create(4);
  actions(c, 'up', 'ok', 'up');
  assert.equal(c.state.systemIndex, 0);
  for (let i = 0; i < systemItems.length; i++) {
    assert.deepEqual(c.handle('ok'), { type: 'system', index: i });
    c.handle('down');
  }
  assert.equal(c.state.systemIndex, exitIndex);
  assert.equal(c.handle('ok'), undefined);
  assert.equal(c.state.zone, 'confirm');
  assert.equal(c.state.confirmIndex, 0);
  assert.equal(c.state.appIndex, 4);
});

test('confirmation isolates input, defaults to No and restores exit after cancellation', () => {
  const c = create(3);
  c.focus('system', exitIndex);
  actions(c, 'ok', 'left', 'up');
  assert.equal(c.state.appIndex, 3);
  assert.equal(c.state.systemIndex, exitIndex);
  assert.equal(c.handle('ok'), undefined);
  assert.equal(c.state.zone, 'system');
  assert.equal(c.state.systemIndex, exitIndex);
  actions(c, 'ok', 'right', 'back');
  assert.equal(c.state.zone, 'system');
  actions(c, 'ok', 'right');
  assert.deepEqual(c.handle('ok'), { type: 'stock-exit' });
  assert.equal(c.state.zone, 'apps');
  assert.equal(c.state.appIndex, 3);
});

test('drawer Back returns to its trigger, then to the same app', () => {
  const c = create(5);
  actions(c, 'up', 'ok', 'down', 'back');
  assert.equal(c.state.zone, 'system-trigger');
  c.handle('back');
  assert.equal(c.state.zone, 'apps');
  assert.equal(c.state.appIndex, 5);
});

test('reopening the system drawer always selects Settings first', () => {
  const c = create();
  actions(c, 'up', 'ok', 'down', 'down', 'back', 'ok');
  assert.equal(c.state.zone, 'system');
  assert.equal(c.state.systemIndex, 0);
  assert.equal(systemItems[c.state.systemIndex].destination, 'settings');
});

test('Back on the carousel preserves Luna and its selected app', () => {
  const c = create(2);
  assert.equal(c.handle('back'), undefined);
  assert.equal(c.state.zone, 'apps');
  assert.equal(c.state.appIndex, 2);
});

test('pointer focus becomes the selection used by keyboard or controller', () => {
  const c = create();
  c.focus('all-apps', 5);
  assert.deepEqual(c.handle('ok'), { type: 'all-app', index: 5 });
  c.focus('system', exitIndex);
  c.handle('ok');
  c.focus('confirm', 1);
  assert.deepEqual(c.handle('ok'), { type: 'stock-exit' });
});

test('held select/back never leaks through to a new screen, even after the repeat interval', () => {
  for (const key of ['Enter', ' ', 'Escape', 'Backspace']) {
    const input = createKeyboardInput();
    assert.ok(input.read(key, false, 1000));
    assert.equal(input.read(key, true, 2000), undefined);
    assert.equal(input.read(key, true, 5000), undefined);
    assert.ok(input.read(key, false, 5100));
  }
});

test('navigation repeat is bounded but distinct quick presses are never dropped', () => {
  const input = createKeyboardInput();
  assert.equal(input.read('ArrowRight', false, 1000), 'right');
  assert.equal(input.read('ArrowRight', true, 1050), undefined);
  assert.equal(input.read('ArrowRight', true, 1060), 'right');
  assert.equal(input.read('ArrowLeft', false, 1111), 'left');
  assert.equal(input.recognizes('Tab'), false);
});
