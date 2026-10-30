import './style.css';
import './ambient.css';

import { createFocusController, createKeyboardInput, type Action, type Effect, type Zone } from './focus-controller';
type Ambience = 'stil' | 'rustig' | 'atmosferisch';

const apps = ['Apple TV', 'Netflix', 'Prime Video', 'HBO Max', 'YouTube', 'Disney+'];
const logoAssets = ['apple-tv-wordmark', 'netflix-wordmark', 'prime-video-wordmark', 'hbo-max-wordmark', 'youtube-wordmark', 'disney-plus-wordmark'];
const navigationItems = ['Search', 'Home', 'Shop', 'Discover', 'Apps'];
const systemItems = [
  ['◉', 'Profile'], ['⌂', 'Home'], ['♧', 'Shop'], ['◈', 'Discover'],
  ['⠿', 'Apps'], ['⇥', 'Inputs'], ['⌁', 'Wi-Fi'], ['⚙', 'Settings'],
] as const;

function readPreference(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* UI still works without storage. */ }
}

const storedAppValue = readPreference('luna:last-app');
const storedApp = storedAppValue === null ? Number.NaN : Number(storedAppValue);
const initialApp = Number.isInteger(storedApp) && storedApp >= 0 && storedApp < apps.length ? storedApp : 2;
const storedAmbience = readPreference('luna:ambience') as Ambience | null;
const root = document.querySelector<HTMLDivElement>('#app')!;

root.innerHTML = `
  <main class="shell" aria-label="Luna projector home">
    <div class="ambient-scene" aria-hidden="true">
      <div class="ambient ambient-stars"></div>
      <div class="ambient ambient-clouds ambient-far"></div>
      <div class="ambient ambient-clouds ambient-near"></div>
      <div class="ambient ambient-clouds ambient-dust"></div>
      <div class="ambient ambient-tint"></div>
      <div class="ambient ambient-lightning"></div>
      <div class="ambient meteor-field"><i class="meteor meteor-one"></i><i class="meteor meteor-two"></i></div>
    </div>
    <div class="ui-zone">
      <header class="topbar">
        <div class="nav-region">
          <button class="nav-trigger" type="button" aria-label="Open hoofdnavigatie" aria-expanded="false">
            <span class="nav-glyph" aria-hidden="true"><i></i><i></i><i></i></span>
          </button>
          <nav class="horizontal-nav" aria-label="Hoofdnavigatie" hidden></nav>
        </div>
        <div class="top-actions">
          <button class="system-trigger" type="button" aria-label="Open systeemmenu" aria-haspopup="dialog" aria-expanded="false">⚙</button>
          <time class="clock" aria-label="Lokale tijd"></time>
        </div>
      </header>
      <section class="app-stage" aria-label="Streamingapps">
        <div class="focus-glow" aria-hidden="true"></div>
        <div class="app-row" role="group" aria-label="Kies een streamingapp"></div>
      </section>
      <aside class="system-drawer" aria-label="Systeemmenu" role="dialog" aria-modal="true" hidden>
        <time class="drawer-clock" aria-hidden="true"></time>
        <div class="system-list"></div>
        <button class="stock-exit" type="button" aria-label="Terug naar stock UI"><span aria-hidden="true">↩</span> Exit to stock UI</button>
      </aside>
      <section class="exit-confirm" role="dialog" aria-modal="true" aria-labelledby="exit-confirm-title" hidden>
        <p id="exit-confirm-title">Back to stock UI?</p>
        <div><button class="confirm-no" type="button">No</button><button class="confirm-yes" type="button">Yes</button></div>
      </section>
      <div class="toast" role="status" aria-live="polite"></div>
    </div>
  </main>`;

const shell = document.querySelector<HTMLElement>('.shell')!;
const navTrigger = document.querySelector<HTMLButtonElement>('.nav-trigger')!;
const horizontalNav = document.querySelector<HTMLElement>('.horizontal-nav')!;
const systemTrigger = document.querySelector<HTMLButtonElement>('.system-trigger')!;
const clock = document.querySelector<HTMLElement>('.clock')!;
const drawerClock = document.querySelector<HTMLElement>('.drawer-clock')!;
const appRow = document.querySelector<HTMLElement>('.app-row')!;
const systemDrawer = document.querySelector<HTMLElement>('.system-drawer')!;
const systemList = document.querySelector<HTMLElement>('.system-list')!;
const stockExit = document.querySelector<HTMLButtonElement>('.stock-exit')!;
const exitConfirm = document.querySelector<HTMLElement>('.exit-confirm')!;
const confirmYes = document.querySelector<HTMLButtonElement>('.confirm-yes')!;
const confirmNo = document.querySelector<HTMLButtonElement>('.confirm-no')!;
const glow = document.querySelector<HTMLElement>('.focus-glow')!;
const toast = document.querySelector<HTMLElement>('.toast')!;

appRow.innerHTML = apps.map((name, index) => `
  <button class="app-slot" type="button" data-index="${index}" aria-label="${name}">
    <img class="logo" src="/assets/logos/${logoAssets[index]}.svg" alt="" />
  </button>`).join('');
horizontalNav.innerHTML = navigationItems.map(name => `<button type="button">${name}</button>`).join('');
systemList.innerHTML = systemItems.map(([icon, label], index) => `
  <button class="system-item" type="button" data-index="${index}">
    <span class="system-icon" aria-hidden="true">${icon}</span><span>${label}</span>
  </button>`).join('');

const controller = createFocusController(apps.length, navigationItems.length, systemItems.length, initialApp);
const state = controller.state;
const keyboardInput = createKeyboardInput();
const appButtons = Array.from(appRow.querySelectorAll<HTMLButtonElement>('button'));
const navButtons = Array.from(horizontalNav.querySelectorAll<HTMLButtonElement>('button'));
const systemButtons = [...Array.from(systemList.querySelectorAll<HTMLButtonElement>('button')), stockExit];
const confirmButtons = [confirmNo, confirmYes];
const topbar = document.querySelector<HTMLElement>('.topbar')!;
const appStage = document.querySelector<HTMLElement>('.app-stage')!;
let toastTimer: number | undefined;
let clockTimer: number | undefined;
let gamepadFrame: number | undefined;
let lastGamepadNavigationAt = 0;
const gamepadPressed: Record<string, boolean> = {};

function updateClock() {
  window.clearTimeout(clockTimer);
  const now = new Date();
  const value = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  clock.textContent = drawerClock.textContent = value;
  if (!document.hidden) clockTimer = window.setTimeout(updateClock, 60000 - now.getSeconds() * 1000 - now.getMilliseconds());
}

function setAmbience(value: Ambience) {
  shell.dataset.ambience = value;
  savePreference('luna:ambience', value);
}

function updateGlow() {
  const active = appButtons[state.appIndex];
  glow.style.setProperty('--glow-x', `${active.offsetLeft + active.offsetWidth / 2}px`);
}

function renderFocus() {
  const inSystem = state.zone === 'system' || state.zone === 'confirm';
  const confirming = state.zone === 'confirm';
  horizontalNav.hidden = state.zone !== 'nav';
  systemDrawer.hidden = !inSystem;
  exitConfirm.hidden = !confirming;
  navTrigger.setAttribute('aria-expanded', String(!horizontalNav.hidden));
  systemTrigger.setAttribute('aria-expanded', String(inSystem));
  topbar.inert = appStage.inert = inSystem;
  systemDrawer.inert = confirming;
  const groups: [HTMLButtonElement[], Zone, number][] = [
    [appButtons, 'apps', state.appIndex], [navButtons, 'nav', state.navIndex],
    [systemButtons, 'system', state.systemIndex], [confirmButtons, 'confirm', state.confirmIndex],
  ];
  for (const [buttons, zone, index] of groups) {
    buttons.forEach((button, i) => {
      const active = state.zone === zone && i === index;
      button.classList.toggle('is-active', active);
      // Each visible region has one Tab stop; focusin reconciles pointer/Tab input.
      button.tabIndex = i === index ? 0 : -1;
    });
  }
  navTrigger.classList.toggle('is-active', state.zone === 'nav-trigger');
  systemTrigger.classList.toggle('is-active', state.zone === 'system-trigger');
  navTrigger.tabIndex = systemTrigger.tabIndex = 0;
  shell.style.setProperty('--scene-x', `${(2.5 - state.appIndex) * 0.55}%`);
  shell.classList.toggle('has-panel', inSystem);
  updateGlow();
}

function focusedButton(): HTMLButtonElement {
  switch (state.zone) {
    case 'apps': return appButtons[state.appIndex];
    case 'nav': return navButtons[state.navIndex];
    case 'system': return systemButtons[state.systemIndex];
    case 'confirm': return confirmButtons[state.confirmIndex];
    case 'nav-trigger': return navTrigger;
    case 'system-trigger': return systemTrigger;
  }
}

function syncFocus() {
  renderFocus();
  focusedButton().focus({ preventScroll: true });
}

function announce(message: string) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

function applyEffect(effect: Effect | undefined) {
  if (!effect) return;
  if (effect.type === 'app') {
    savePreference('luna:last-app', String(effect.index));
    announce(`${apps[effect.index]} — demo; openen op de projector volgt`);
  } else if (effect.type === 'stock-exit') {
    announce('Exit to stock UI — demo; projectoradapter volgt via ADB');
  } else {
    const label = effect.type === 'navigation' ? navigationItems[effect.index] : systemItems[effect.index][1];
    if (label === 'Home') controller.focus('apps', state.appIndex);
    else if (effect.type === 'system' && label === 'Settings') {
      const modes: Ambience[] = ['stil', 'rustig', 'atmosferisch'];
      const current = (shell.dataset.ambience as Ambience) || 'rustig';
      const next = modes[(modes.indexOf(current) + 1) % modes.length];
      setAmbience(next);
      announce(`Achtergrondstand: ${next}`);
    } else announce(`${label} — nog niet gekoppeld in het prototype`);
  }
}

function handleAction(action: Action) {
  const previousAppIndex = state.appIndex;
  applyEffect(controller.handle(action));
  syncFocus();
  if (state.zone === 'apps' && state.appIndex !== previousAppIndex) {
    glow.classList.remove('is-relighting');
    void glow.offsetWidth;
    glow.classList.add('is-relighting');
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Tab' && (state.zone === 'system' || state.zone === 'confirm')) {
    event.preventDefault();
    if (state.zone === 'confirm') controller.focus('confirm', 1 - state.confirmIndex);
    else controller.focus('system', (state.systemIndex + (event.shiftKey ? -1 : 1) + systemButtons.length) % systemButtons.length);
    syncFocus();
    return;
  }
  if (!keyboardInput.recognizes(event.key)) return;
  event.preventDefault();
  const action = keyboardInput.read(event.key, event.repeat, performance.now());
  if (action) handleAction(action);
}

// Native focus changes (Tab or pointer) must update the same model as the D-pad.
function bindButton(button: HTMLButtonElement, zone: Zone, index = 0) {
  button.addEventListener('focus', () => {
    controller.focus(zone, index);
    renderFocus();
  });
  button.addEventListener('click', () => {
    controller.focus(zone, index);
    handleAction('ok');
  });
}
appButtons.forEach((button, index) => bindButton(button, 'apps', index));
navButtons.forEach((button, index) => bindButton(button, 'nav', index));
systemButtons.forEach((button, index) => bindButton(button, 'system', index));
confirmButtons.forEach((button, index) => bindButton(button, 'confirm', index));
bindButton(navTrigger, 'nav-trigger');
bindButton(systemTrigger, 'system-trigger');
document.addEventListener('keydown', onKeyDown);

function connectedGamepad() {
  try { return Array.from(navigator.getGamepads()).find(Boolean); }
  catch { return undefined; }
}

function pollGamepad(now: number) {
  gamepadFrame = undefined;
  const pad = connectedGamepad();
  if (document.hidden || !pad) return;
  const inputs: Record<Action, boolean> = {
    left: Boolean(pad.buttons[14]?.pressed || pad.axes[0] < -0.65),
    right: Boolean(pad.buttons[15]?.pressed || pad.axes[0] > 0.65),
    up: Boolean(pad.buttons[12]?.pressed || pad.axes[1] < -0.65),
    down: Boolean(pad.buttons[13]?.pressed || pad.axes[1] > 0.65),
    ok: Boolean(pad.buttons[0]?.pressed || pad.buttons[9]?.pressed),
    back: Boolean(pad.buttons[1]?.pressed || pad.buttons[8]?.pressed),
  };
  for (const action of Object.keys(inputs) as Action[]) {
    const pressed = inputs[action];
    const wasPressed = gamepadPressed[action] ?? false;
    const navigation = action !== 'ok' && action !== 'back';
    if (pressed && (!wasPressed || (navigation && now - lastGamepadNavigationAt >= 110))) {
      handleAction(action);
      if (navigation) lastGamepadNavigationAt = now;
    }
    gamepadPressed[action] = pressed;
  }
  gamepadFrame = requestAnimationFrame(pollGamepad);
}

function startGamepadPolling() {
  if (!document.hidden && gamepadFrame === undefined && connectedGamepad()) gamepadFrame = requestAnimationFrame(pollGamepad);
}
function stopGamepadPolling() {
  if (gamepadFrame !== undefined) cancelAnimationFrame(gamepadFrame);
  gamepadFrame = undefined;
  for (const key of Object.keys(gamepadPressed)) delete gamepadPressed[key];
  lastGamepadNavigationAt = 0;
}
function updateVisibility() {
  shell.classList.toggle('is-hidden', document.hidden);
  if (document.hidden) {
    stopGamepadPolling();
    window.clearTimeout(clockTimer);
    window.clearTimeout(toastTimer);
    toast.classList.remove('is-visible');
  } else {
    updateClock();
    startGamepadPolling();
  }
}
document.addEventListener('visibilitychange', updateVisibility);
window.addEventListener('gamepadconnected', startGamepadPolling);
window.addEventListener('gamepaddisconnected', () => { stopGamepadPolling(); startGamepadPolling(); });
window.addEventListener('pagehide', () => { stopGamepadPolling(); window.clearTimeout(clockTimer); });
window.addEventListener('pageshow', updateVisibility);
window.addEventListener('resize', updateGlow);

setAmbience(storedAmbience === 'stil' || storedAmbience === 'rustig' ? storedAmbience : 'atmosferisch');
updateVisibility();
syncFocus();
