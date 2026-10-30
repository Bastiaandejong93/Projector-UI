import './style.css';

type Zone = 'apps' | 'nav-trigger' | 'system-trigger' | 'system';
type Ambience = 'stil' | 'rustig' | 'atmosferisch';

const apps = ['Apple TV', 'Netflix', 'Prime Video', 'HBO Max', 'YouTube', 'Disney+'];
const logoAssets = ['apple-tv-wordmark', 'netflix-wordmark', 'prime-video-wordmark', 'hbo-max-wordmark', 'youtube-wordmark', 'disney-plus-wordmark'];
const navigationItems = ['Search', 'Home', 'Shop', 'Discover', 'Apps'];
const systemItems = [
  ['◉', 'Profile'], ['⌂', 'Home'], ['♧', 'Shop'], ['◈', 'Discover'],
  ['⠿', 'Apps'], ['⇥', 'Inputs'], ['⌁', 'Wi-Fi'], ['⚙', 'Settings'],
] as const;

const storedAppValue = localStorage.getItem('luna:last-app');
const storedApp = storedAppValue === null ? Number.NaN : Number(storedAppValue);
const initialApp = Number.isInteger(storedApp) && storedApp >= 0 && storedApp < apps.length ? storedApp : 2;
const storedAmbience = localStorage.getItem('luna:ambience') as Ambience | null;
const root = document.querySelector<HTMLDivElement>('#app')!;

root.innerHTML = `
  <main class="shell" aria-label="Luna projector home">
    <div class="ambient ambient-clouds ambient-far" aria-hidden="true"></div>
    <div class="ambient ambient-clouds ambient-near" aria-hidden="true"></div>
    <div class="ambient ambient-stars" aria-hidden="true"></div>
    <div class="ambient ambient-tint" aria-hidden="true"></div>
    <div class="ambient ambient-lightning" aria-hidden="true"></div>
    <div class="ui-zone">
      <header class="topbar">
        <div class="nav-region">
          <button class="nav-trigger" type="button" aria-label="Open hoofdnavigatie" aria-expanded="false">
            <span class="nav-glyph" aria-hidden="true"><i></i><i></i><i></i></span>
          </button>
          <nav class="horizontal-nav" aria-label="Hoofdnavigatie" hidden></nav>
        </div>
        <div class="top-actions">
          <button class="system-trigger" type="button" aria-label="Open systeemmenu" aria-haspopup="menu" aria-expanded="false">⚙</button>
          <time class="clock" aria-label="Lokale tijd"></time>
        </div>
      </header>
      <section class="app-stage" aria-label="Streamingapps">
        <div class="focus-glow" aria-hidden="true"></div>
        <div class="app-row" role="listbox" aria-label="Kies een streamingapp"></div>
      </section>
      <aside class="system-drawer" aria-label="Systeemmenu" role="menu" hidden>
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
  <button class="app-slot" type="button" role="option" data-index="${index}" aria-label="${name}">
    <img class="logo" src="/assets/logos/${logoAssets[index]}.svg" alt="${name}" />
  </button>`).join('');
horizontalNav.innerHTML = navigationItems.map(name => `<button type="button" role="menuitem">${name}</button>`).join('');
systemList.innerHTML = systemItems.map(([icon, label], index) => `
  <button class="system-item" type="button" role="menuitem" data-index="${index}">
    <span class="system-icon" aria-hidden="true">${icon}</span><span>${label}</span>
  </button>`).join('');

let zone: Zone = 'apps';
let appIndex = initialApp;
let systemIndex = 0;
let lastAppIndex = initialApp;
let toastTimer: number | undefined;
let lastKeyAt = 0;
let gamepadFrame: number | undefined;
let lastGamepadNavigationAt = 0;
const gamepadPressed: Record<string, boolean> = {};

function updateClock() {
  const now = new Date();
  const value = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  clock.textContent = value;
  drawerClock.textContent = value;
  window.setTimeout(updateClock, (60 - now.getSeconds()) * 1000);
}

function setAmbience(value: Ambience) {
  shell.dataset.ambience = value;
  localStorage.setItem('luna:ambience', value);
}

function renderFocus() {
  const appButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.app-slot'));
  const systemButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.system-item'));
  appButtons.forEach((button, index) => {
    const active = zone === 'apps' && index === appIndex;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  systemButtons.forEach((button, index) => {
    const active = zone === 'system' && index === systemIndex;
    button.classList.toggle('is-active', active);
    button.tabIndex = active ? 0 : -1;
  });
  navTrigger.classList.toggle('is-active', zone === 'nav-trigger');
  navTrigger.tabIndex = zone === 'nav-trigger' ? 0 : -1;
  systemTrigger.classList.toggle('is-active', zone === 'system-trigger');
  systemTrigger.tabIndex = zone === 'system-trigger' ? 0 : -1;
  const activeButton = appButtons[appIndex];
  if (activeButton) glow.style.setProperty('--glow-x', `${activeButton.offsetLeft + activeButton.offsetWidth / 2}px`);
}

function relightFocus() {
  glow.classList.remove('is-relighting');
  void glow.offsetWidth;
  glow.classList.add('is-relighting');
}

function focusDom() {
  const target = zone === 'apps'
    ? document.querySelector<HTMLButtonElement>(`.app-slot[data-index="${appIndex}"]`)
    : zone === 'nav-trigger'
      ? navTrigger
      : zone === 'system-trigger'
      ? systemTrigger
      : document.querySelector<HTMLButtonElement>(`.system-item[data-index="${systemIndex}"]`);
  target?.focus({ preventScroll: true });
}

function closeNav() {
  horizontalNav.hidden = true;
  navTrigger.setAttribute('aria-expanded', 'false');
}

function toggleNav() {
  const willOpen = horizontalNav.hidden;
  horizontalNav.hidden = !willOpen;
  navTrigger.setAttribute('aria-expanded', String(willOpen));
}

function openSystem() {
  closeNav();
  lastAppIndex = appIndex;
  zone = 'system';
  systemIndex = 0;
  systemDrawer.hidden = false;
  systemTrigger.setAttribute('aria-expanded', 'true');
  renderFocus();
  focusDom();
}

function closeSystem(toApps = false) {
  systemDrawer.hidden = true;
  systemTrigger.setAttribute('aria-expanded', 'false');
  zone = toApps ? 'apps' : 'system-trigger';
  appIndex = lastAppIndex;
  renderFocus();
  focusDom();
}

function announce(message: string) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

function activateApp(index = appIndex) {
  lastAppIndex = index;
  appIndex = index;
  localStorage.setItem('luna:last-app', String(index));
  announce(`${apps[index]} — demo; openen op de projector volgt`);
}

function activateSystem() {
  const label = systemItems[systemIndex][1];
  if (label === 'Home') return closeSystem(true);
  if (label === 'Settings') {
    const modes: Ambience[] = ['stil', 'rustig', 'atmosferisch'];
    const current = (shell.dataset.ambience as Ambience) || 'rustig';
    const next = modes[(modes.indexOf(current) + 1) % modes.length];
    setAmbience(next);
    return announce(`Achtergrondstand: ${next}`);
  }
  announce(`${label} — nog niet gekoppeld in het prototype`);
}

function requestStockExit() {
  exitConfirm.hidden = true;
  closeSystem(true);
  announce('Exit to stock UI — demo; projectoradapter volgt via ADB');
}

function openExitConfirm() {
  exitConfirm.hidden = false;
  confirmNo.focus({ preventScroll: true });
}

function closeExitConfirm() {
  exitConfirm.hidden = true;
  stockExit.focus({ preventScroll: true });
}

function move(delta: number) {
  const previousAppIndex = appIndex;
  if (zone === 'apps') appIndex = Math.max(0, Math.min(apps.length - 1, appIndex + delta));
  if (zone === 'system') systemIndex = Math.max(0, Math.min(systemItems.length - 1, systemIndex + delta));
  renderFocus();
  focusDom();
  if (zone === 'apps' && appIndex !== previousAppIndex) relightFocus();
}

function handleAction(action: string) {
  if (action === 'left' || action === 'right') {
    if (zone === 'apps') move(action === 'left' ? -1 : 1);
    else if (zone === 'system-trigger' && action === 'left') { zone = 'nav-trigger'; renderFocus(); focusDom(); }
    else if (zone === 'nav-trigger' && action === 'right') { zone = 'system-trigger'; renderFocus(); focusDom(); }
    return;
  }
  if (action === 'up') {
    if (zone === 'apps') { zone = 'nav-trigger'; renderFocus(); focusDom(); }
    else if (zone === 'system') move(-1);
    return;
  }
  if (action === 'down') {
    if (zone === 'nav-trigger') { closeNav(); zone = 'apps'; renderFocus(); focusDom(); }
    if (zone === 'system-trigger') { zone = 'apps'; renderFocus(); focusDom(); }
    else if (zone === 'system') move(1);
    return;
  }
  if (action === 'ok') {
    if (zone === 'apps') activateApp();
    else if (zone === 'nav-trigger') toggleNav();
    else if (zone === 'system-trigger') openSystem();
    else activateSystem();
    return;
  }
  if (action === 'back') {
    if (!horizontalNav.hidden) return closeNav();
    if (zone === 'system') closeSystem();
    else if (zone === 'nav-trigger') { zone = 'apps'; renderFocus(); focusDom(); }
    else if (zone === 'system-trigger') closeSystem(true);
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (!exitConfirm.hidden) {
    if (event.key === 'Escape' || event.key === 'Backspace') { event.preventDefault(); closeExitConfirm(); }
    return;
  }
  const map: Record<string, string> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'ok', ' ': 'ok', Escape: 'back', Backspace: 'back' };
  const action = map[event.key];
  if (!action) return;
  event.preventDefault();
  if (event.repeat && performance.now() - lastKeyAt < 110) return;
  lastKeyAt = performance.now();
  handleAction(action);
}

function pollGamepad(now: number) {
  let controller: Gamepad | null = null;
  for (const candidate of navigator.getGamepads()) {
    if (candidate) { controller = candidate; break; }
  }
  if (!controller) {
    gamepadFrame = undefined;
    Object.keys(gamepadPressed).forEach(key => delete gamepadPressed[key]);
    return;
  }

  const inputs: Record<string, boolean> = {
    left: Boolean(controller.buttons[14]?.pressed || controller.axes[0] < -0.65),
    right: Boolean(controller.buttons[15]?.pressed || controller.axes[0] > 0.65),
    up: Boolean(controller.buttons[12]?.pressed || controller.axes[1] < -0.65),
    down: Boolean(controller.buttons[13]?.pressed || controller.axes[1] > 0.65),
    ok: Boolean(controller.buttons[0]?.pressed || controller.buttons[9]?.pressed),
    back: Boolean(controller.buttons[1]?.pressed || controller.buttons[8]?.pressed),
  };

  for (const [action, isPressed] of Object.entries(inputs)) {
    const wasPressed = gamepadPressed[action] ?? false;
    if (isPressed) {
      const isNavigation = action === 'left' || action === 'right' || action === 'up' || action === 'down';
      if ((isNavigation && (!wasPressed || now - lastGamepadNavigationAt >= 110)) || (!isNavigation && !wasPressed)) {
        handleAction(action);
        if (isNavigation) lastGamepadNavigationAt = now;
      }
    }
    gamepadPressed[action] = isPressed;
  }
  gamepadFrame = requestAnimationFrame(pollGamepad);
}

function startGamepadPolling() {
  if (gamepadFrame === undefined && 'getGamepads' in navigator) gamepadFrame = requestAnimationFrame(pollGamepad);
}

navTrigger.addEventListener('click', () => { zone = 'nav-trigger'; toggleNav(); renderFocus(); focusDom(); });
systemTrigger.addEventListener('click', () => { zone = 'system-trigger'; openSystem(); });
document.querySelectorAll<HTMLButtonElement>('.horizontal-nav button').forEach(button => {
  button.addEventListener('click', () => {
    closeNav();
    if (button.textContent === 'Home') closeSystem(true);
    else announce(`${button.textContent} — nog niet gekoppeld in het prototype`);
  });
});
document.querySelectorAll<HTMLButtonElement>('.app-slot').forEach(button => {
  button.addEventListener('click', () => {
    const previousAppIndex = appIndex;
    appIndex = Number(button.dataset.index);
    zone = 'apps';
    renderFocus();
    if (appIndex !== previousAppIndex) relightFocus();
    activateApp();
  });
});
document.querySelectorAll<HTMLButtonElement>('.system-item').forEach(button => {
  button.addEventListener('click', () => { systemIndex = Number(button.dataset.index); zone = 'system'; renderFocus(); activateSystem(); });
});
stockExit.addEventListener('click', openExitConfirm);
confirmNo.addEventListener('click', closeExitConfirm);
confirmYes.addEventListener('click', requestStockExit);
document.addEventListener('keydown', onKeyDown);
document.addEventListener('visibilitychange', () => shell.classList.toggle('is-hidden', document.hidden));
window.addEventListener('gamepadconnected', startGamepadPolling);
window.addEventListener('gamepaddisconnected', () => { /* polling stops once no controller remains */ });
if ('getGamepads' in navigator && Array.from(navigator.getGamepads()).some(Boolean)) startGamepadPolling();

setAmbience(storedAmbience === 'stil' || storedAmbience === 'atmosferisch' ? storedAmbience : 'rustig');
updateClock();
renderFocus();
