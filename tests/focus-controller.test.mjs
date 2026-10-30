import test from 'node:test';
import assert from 'node:assert/strict';
import { createFocusController, createKeyboardInput } from '../.test-build/focus-controller.js';

const create = (initial = 2) => createFocusController(6, 5, 8, initial);
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

test('carousel reaches both triggers; Down returns without opening the drawer', () => {
  const c = create(4);
  c.handle('up');
  assert.equal(c.state.zone, 'nav-trigger');
  c.handle('right');
  assert.equal(c.state.zone, 'system-trigger');
  c.handle('left');
  assert.equal(c.state.zone, 'nav-trigger');
  actions(c, 'right', 'down');
  assert.equal(c.state.zone, 'apps');
  assert.equal(c.state.appIndex, 4);
});

test('every expanded navigation item is reachable and activates the correct action', () => {
  const c = create();
  actions(c, 'up', 'ok');
  assert.equal(c.state.zone, 'nav');
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(c.handle('ok'), { type: 'navigation', index: i });
    c.handle('right');
  }
  assert.equal(c.state.zone, 'system-trigger');
  actions(c, 'left', 'ok', 'left');
  assert.equal(c.state.zone, 'nav-trigger');
  actions(c, 'ok', 'back');
  assert.equal(c.state.zone, 'nav-trigger');
  actions(c, 'ok', 'down');
  assert.equal(c.state.zone, 'apps');
});

test('drawer includes the exit in the same D-pad route', () => {
  const c = create(4);
  actions(c, 'up', 'right', 'ok', 'up');
  assert.equal(c.state.systemIndex, 0);
  for (let i = 0; i < 8; i++) {
    assert.deepEqual(c.handle('ok'), { type: 'system', index: i });
    c.handle('down');
  }
  c.handle('down');
  assert.equal(c.state.systemIndex, 8);
  assert.equal(c.handle('ok'), undefined);
  assert.equal(c.state.zone, 'confirm');
  assert.equal(c.state.confirmIndex, 0);
  assert.equal(c.state.appIndex, 4);
});

test('confirmation isolates input, defaults to No and restores exit after cancellation', () => {
  const c = create(3);
  c.focus('system', 8);
  actions(c, 'ok', 'left', 'up');
  assert.equal(c.state.appIndex, 3);
  assert.equal(c.state.systemIndex, 8);
  assert.equal(c.handle('ok'), undefined);
  assert.equal(c.state.zone, 'system');
  assert.equal(c.state.systemIndex, 8);
  actions(c, 'ok', 'right', 'back');
  assert.equal(c.state.zone, 'system');
  actions(c, 'ok', 'right');
  assert.deepEqual(c.handle('ok'), { type: 'stock-exit' });
  assert.equal(c.state.zone, 'apps');
  assert.equal(c.state.appIndex, 3);
});

test('drawer Back returns to its trigger, then to the same app', () => {
  const c = create(5);
  actions(c, 'up', 'right', 'ok', 'down', 'back');
  assert.equal(c.state.zone, 'system-trigger');
  c.handle('back');
  assert.equal(c.state.zone, 'apps');
  assert.equal(c.state.appIndex, 5);
});

test('pointer/Tab focus becomes the selection used by keyboard or controller', () => {
  const c = create();
  c.focus('nav', 3);
  assert.deepEqual(c.handle('ok'), { type: 'navigation', index: 3 });
  c.focus('system', 8);
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
  assert.equal(input.read('ArrowRight', true, 1110), 'right');
  assert.equal(input.read('ArrowLeft', false, 1111), 'left');
  assert.equal(input.recognizes('Tab'), false);
});
