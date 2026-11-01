import './style.css';
import './ambient.css';

import { createFocusController, createKeyboardInput, type Action, type Effect, type Zone } from './focus-controller';
import { exitToNativeStockHome, getSpotifyPlayback, launchNativeApp, launchNativeComponent, listNativeLaunchableApps, openNativeSystem, spotifyAction, type LunaAppId, type SpotifyPlayback } from './luna-host';
import { menuIcon, systemItems } from './menu-items';

const featuredApps: Array<{ id: LunaAppId; label: string; logo: string; packageName: string; home: boolean; iconOnly?: boolean }> = [
  { id: 'apple-tv', label: 'Apple TV', logo: 'apple-tv-wordmark', packageName: 'com.apple.atve.androidtv.appletv', home: true },
  { id: 'netflix', label: 'Netflix', logo: 'netflix-wordmark', packageName: 'com.netflix.ninja', home: true },
  { id: 'prime-video', label: 'Prime Video', logo: 'prime-video-wordmark', packageName: 'com.amazon.amazonvideo.livingroom', home: true },
  { id: 'max', label: 'HBO Max', logo: 'hbo-max-wordmark', packageName: 'com.wbd.hbomax', home: true },
  { id: 'youtube', label: 'YouTube', logo: 'youtube-wordmark', packageName: 'com.google.android.youtube.tv', home: true },
  { id: 'disney-plus', label: 'Disney+', logo: 'disney-plus-wordmark', packageName: 'com.disney.disneyplus', home: true },
  { id: 'bilibili', label: 'Bilibili', logo: 'bilibili', packageName: 'com.xiaodianshi.tv.yst', home: false, iconOnly: true },
  { id: 'jellyfin', label: 'Jellyfin', logo: 'jellyfin', packageName: 'org.jellyfin.androidtv', home: false, iconOnly: true },
  { id: 'ufc', label: 'UFC', logo: 'ufc', packageName: 'com.neulion.smartphone.ufc.android', home: false, iconOnly: true },
  { id: 'spotify', label: 'Spotify', logo: 'spotify', packageName: 'com.spotify.tv.android', home: false, iconOnly: true },
  { id: 'vlc', label: 'VLC', logo: 'vlc-player', packageName: 'org.videolan.vlc', home: false, iconOnly: true },
];

type LauncherApp = {
  id: string;
  label: string;
  icon: string;
  component?: string;
  appId?: LunaAppId;
  logo?: string;
  home?: boolean;
  iconOnly?: boolean;
};

function readPreference(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* UI still works without storage. */ }
}
function readStringArray(key: string) {
  try {
    const value: unknown = JSON.parse(readPreference(key) ?? 'null');
    return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null;
  } catch {
    return null;
  }
}
function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);
}

function featuredAppFor(component: string, label: string) {
  const normalizedLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return featuredApps.find(candidate =>
    component.startsWith(`${candidate.packageName}/`) ||
    normalizedLabel === candidate.label.toLowerCase() ||
    normalizedLabel.includes(candidate.label.toLowerCase()) ||
    (candidate.id === 'max' && /(^| )max( |$)|hbo/.test(normalizedLabel)) ||
    (candidate.id === 'prime-video' && /prime/.test(normalizedLabel)) ||
    (candidate.id === 'disney-plus' && /disney/.test(normalizedLabel)) ||
    (candidate.id === 'apple-tv' && /apple.*tv|tv.*apple/.test(normalizedLabel)) ||
    (candidate.id === 'vlc' && /vlc|videolan/.test(normalizedLabel))
  );
}

function discoverApps(): LauncherApp[] {
  const nativeApps = listNativeLaunchableApps();
  return nativeApps.length > 0
    ? nativeApps.map(app => {
      // Packages differ across Android TV builds. Prefer our refined service
      // mark whenever either the component or the launcher label identifies it.
      const featured = featuredAppFor(app.component, app.label);
      const logo = featured?.logo ?? (/spotify/i.test(app.label) || app.component.startsWith('com.spotify.') ? 'spotify' : undefined);
      // The All Apps catalogue is intentionally native: it keeps Android's
      // stock app artwork. Luna's monochrome marks are Home-only.
      const icon = app.icon;
      return { id: app.component, ...app, label: featured?.label ?? app.label, icon, appId: featured?.id, logo, home: featured?.home, iconOnly: featured?.iconOnly };
    })
    : featuredApps.map(app => ({
      id: `builtin:${app.id}`,
      label: app.label,
      icon: `/assets/logos/${app.logo}.svg`,
      appId: app.id,
      logo: app.logo,
      home: app.home,
      iconOnly: app.iconOnly,
    }));
}

let allApps = discoverApps();

const defaultHomeAppIds = allApps.filter(app => app.home === true).map(app => app.id);
const savedHomeAppIds = readStringArray('luna:home-apps');
let homeAppIds = (savedHomeAppIds ?? defaultHomeAppIds).filter(id => allApps.some(app => app.id === id));
if (homeAppIds.length === 0) homeAppIds = (defaultHomeAppIds.length ? defaultHomeAppIds : allApps.map(app => app.id).slice(0, 6));
let homeCarouselApps = homeAppIds.map(id => allApps.find(app => app.id === id)!).filter(Boolean);
const rememberedHomeApp = readPreference('luna:last-home-app');
const defaultHomeIndex = Math.max(0, homeCarouselApps.findIndex(app => app.id === rememberedHomeApp));
const initialApp = defaultHomeIndex >= 0 ? defaultHomeIndex : Math.min(2, homeCarouselApps.length - 1);

const root = document.querySelector<HTMLDivElement>('#app')!;
const dreamMode = new URLSearchParams(window.location.search).get('mode') === 'dream';

root.innerHTML = `
  <main class="shell${dreamMode ? ' is-dream' : ''}" aria-label="${dreamMode ? 'Luna sterrenhemel' : 'Luna projector home'}">
    <div class="ambient-scene" aria-hidden="true">
      <div class="ambient ambient-stars"></div>
      <canvas class="ambient-canvas" aria-hidden="true"></canvas>
      <div class="ambient ambient-clouds ambient-near"></div>
      <div class="ambient ambient-clouds ambient-dust"></div>
      <div class="ambient ambient-clouds ambient-veil"></div>
      <div class="ambient ambient-luna-glow"></div>
      <div class="ambient ambient-shimmer"></div>
      <div class="ambient ambient-aurora"></div>
      <div class="ambient ambient-milky-band"></div>
      <div class="ambient ambient-dusk-clouds"></div>
      <div class="ambient ambient-tint"></div>
      <div class="ambient ambient-thunder" aria-hidden="true"></div>
      <div class="ambient ambient-cirrus" aria-hidden="true"></div>
      <div class="ambient ambient-limb" aria-hidden="true"></div>
      <div class="ambient ambient-satellite" aria-hidden="true"></div>
      <div class="ambient ambient-firefly" aria-hidden="true"></div>
      <div class="ambient ambient-comet" aria-hidden="true"></div>
      <div class="ambient meteor-field"><i class="meteor meteor-one"></i><i class="meteor meteor-two"></i><span class="meteor-shower" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>
    </div>
    <div class="ui-zone">
      <header class="topbar">
        <div class="top-actions">
          <button class="system-trigger" type="button" aria-label="Open systeemmenu" aria-haspopup="dialog" aria-expanded="false">${menuIcon('settings')}</button>
          <time class="clock" aria-label="Lokale tijd"></time>
        </div>
      </header>
      <section class="app-stage" aria-label="Streamingapps">
        <div class="focus-glow" aria-hidden="true"></div>
        <div class="app-row" role="group" aria-label="Kies een app voor Luna Home"></div>
      </section>
      <aside class="system-drawer" aria-label="Systeemmenu" role="dialog" aria-modal="true" hidden>
        <time class="drawer-clock" aria-hidden="true"></time>
        <div class="system-list"></div>
        <button class="stock-exit system-item" type="button" aria-label="Terug naar stock UI"><span class="system-icon">${menuIcon('exit')}</span><span>Exit to Stock UI</span></button>
      </aside>
      <section class="exit-confirm" role="dialog" aria-modal="true" aria-labelledby="exit-confirm-title" hidden>
        <p id="exit-confirm-title">Back to stock UI?</p>
        <div><button class="confirm-no" type="button">No</button><button class="confirm-yes" type="button">Yes</button></div>
      </section>
      <div class="toast" role="status" aria-live="polite"></div>
    </div>
    <section class="all-apps-page" aria-label="All Apps" role="dialog" aria-modal="true" hidden>
      <header class="all-apps-header"><h1>All Apps</h1><button class="all-apps-trigger" type="button">Home Apps</button></header>
      <div class="all-apps-grid" role="group" aria-label="All installed apps"></div>
    </section>
    <section class="home-apps-page" aria-label="Home Apps" role="dialog" aria-modal="true" hidden>
      <header class="all-apps-header"><h1>Home Apps</h1><button class="home-apps-trigger" type="button">All Apps</button></header>
      <p class="collection-description">Select apps for Luna Home</p>
      <div class="home-apps-grid" role="group" aria-label="Choose apps for Luna Home"></div>
    </section>
    <section class="spotify-bubble" aria-label="Spotify status">
      <div class="spotify-art" aria-hidden="true"><img alt="" /></div>
      <div class="spotify-player">
        <div class="spotify-bubble-header"><button class="spotify-dismiss" type="button" aria-label="Spotify-paneel verbergen">×</button></div>
        <div class="spotify-bubble-track"><strong class="spotify-track-title">Luister op je TV</strong><span class="spotify-track-artist">Verbind Spotify om af te spelen</span></div>
        <div class="spotify-progress" role="progressbar" aria-label="Voortgang nummer" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
        <div class="spotify-bubble-actions"><button class="spotify-control spotify-previous" type="button" aria-label="Vorige nummer" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5 9 12l9 7V5ZM6 5v14"/></svg></button><button class="spotify-connect" type="button" aria-label="Pauzeren"><span class="spotify-pause-glyph" aria-hidden="true"></span></button><button class="spotify-control spotify-next" type="button" aria-label="Volgende nummer" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 5 9 7-9 7V5Zm12 0v14"/></svg></button></div>
      </div>
    </section>
  </main>`;

// Keep the legacy quiet preference meaningful for existing projector installs.
if (readPreference('luna:ambience') === 'stil') root.querySelector<HTMLElement>('.shell')!.dataset.ambience = 'stil';

const systemTrigger = document.querySelector<HTMLButtonElement>('.system-trigger')!;
const clock = document.querySelector<HTMLElement>('.clock')!;
const drawerClock = document.querySelector<HTMLElement>('.drawer-clock')!;
const appRow = document.querySelector<HTMLElement>('.app-row')!;
const allAppsPage = document.querySelector<HTMLElement>('.all-apps-page')!;
const allAppsGrid = document.querySelector<HTMLElement>('.all-apps-grid')!;
const allAppsTrigger = document.querySelector<HTMLButtonElement>('.all-apps-trigger')!;
const homeAppsPage = document.querySelector<HTMLElement>('.home-apps-page')!;
const homeAppsGrid = document.querySelector<HTMLElement>('.home-apps-grid')!;
const homeAppsTrigger = document.querySelector<HTMLButtonElement>('.home-apps-trigger')!;
const systemDrawer = document.querySelector<HTMLElement>('.system-drawer')!;
const systemList = document.querySelector<HTMLElement>('.system-list')!;
const stockExit = document.querySelector<HTMLButtonElement>('.stock-exit')!;
const exitConfirm = document.querySelector<HTMLElement>('.exit-confirm')!;
const confirmYes = document.querySelector<HTMLButtonElement>('.confirm-yes')!;
const confirmNo = document.querySelector<HTMLButtonElement>('.confirm-no')!;
const glow = document.querySelector<HTMLElement>('.focus-glow')!;
const toast = document.querySelector<HTMLElement>('.toast')!;
const topbar = document.querySelector<HTMLElement>('.topbar')!;
const appStage = document.querySelector<HTMLElement>('.app-stage')!;
const ambientScene = document.querySelector<HTMLElement>('.ambient-scene')!;
const spotifyBubble = document.querySelector<HTMLElement>('.spotify-bubble')!;
const spotifyArt = document.querySelector<HTMLImageElement>('.spotify-art img')!;
const spotifyTrackTitle = document.querySelector<HTMLElement>('.spotify-track-title')!;
const spotifyTrackArtist = document.querySelector<HTMLElement>('.spotify-track-artist')!;
const spotifyPauseGlyph = document.querySelector<HTMLElement>('.spotify-pause-glyph')!;
const spotifyConnect = document.querySelector<HTMLButtonElement>('.spotify-connect')!;
const spotifyPrevious = document.querySelector<HTMLButtonElement>('.spotify-previous')!;
const spotifyNext = document.querySelector<HTMLButtonElement>('.spotify-next')!;
const spotifyDismiss = document.querySelector<HTMLButtonElement>('.spotify-dismiss')!;
const spotifyProgress = document.querySelector<HTMLElement>('.spotify-progress')!;
const spotifyButtons = [spotifyPrevious, spotifyConnect, spotifyNext, spotifyDismiss];
let spotifyPlayback: SpotifyPlayback = { connected: false, playing: false, title: 'Luister op je TV', artist: 'Verbind Spotify om af te spelen' };
let spotifyPanelDismissed = false;
let spotifyProgressBaseMs = 0;
let spotifyProgressStartedAt = 0;
let spotifyProgressTimer: number | undefined;

function spotifyApp() {
  return allApps.find(app => /spotify/i.test(app.label) || app.component?.startsWith('com.spotify.'));
}

function openSpotify() {
  const app = spotifyApp();
  if (app?.component && launchNativeComponent(app.component)) return;
  announce('Spotify is niet geïnstalleerd op deze projector');
}

function spotifyShouldShow() {
  return (dreamMode || internalDreamActive) && spotifyPlayback.connected && spotifyPlayback.playing && !spotifyPanelDismissed;
}

function renderSpotifyProgress() {
  const duration = Math.max(0, spotifyPlayback.durationMs ?? 0);
  const elapsed = spotifyPlayback.playing && spotifyProgressStartedAt > 0 ? performance.now() - spotifyProgressStartedAt : 0;
  const position = Math.min(duration, Math.max(0, spotifyProgressBaseMs + elapsed));
  const percentage = duration > 0 ? position / duration * 100 : 0;
  spotifyProgress.style.setProperty('--spotify-progress', `${percentage}%`);
  spotifyProgress.setAttribute('aria-valuenow', percentage.toFixed(1));
}

function scheduleSpotifyProgress() {
  window.clearTimeout(spotifyProgressTimer);
  if (!spotifyPlayback.connected || !spotifyPlayback.playing || (spotifyPlayback.durationMs ?? 0) <= 0) return;
  spotifyProgressTimer = window.setTimeout(() => {
    renderSpotifyProgress();
    scheduleSpotifyProgress();
  }, 250);
}

function updateSpotifyVisibility() {
  const visible = spotifyShouldShow();
  spotifyBubble.classList.toggle('is-active', visible);
  controller.setSpotifyCount(visible ? spotifyButtons.length : 0);
  if (appButtons.length) renderFocus();
}

function setSpotifyPlayback(next: SpotifyPlayback) {
  spotifyPlayback = next;
  if (!next.connected) spotifyPanelDismissed = false;
  spotifyBubble.classList.toggle('is-playing', next.playing);
  spotifyArt.classList.toggle('is-playing', next.playing);
  spotifyBubble.classList.toggle('has-art', Boolean(next.artworkUrl));
  spotifyTrackTitle.textContent = next.connected ? next.title : 'Luister op je TV';
  spotifyTrackArtist.textContent = next.connected ? next.artist : 'Verbind Spotify om af te spelen';
  spotifyPauseGlyph.classList.toggle('is-playing', next.playing);
  spotifyPauseGlyph.setAttribute('aria-label', next.playing ? 'Pauzeren' : 'Afspelen');
  spotifyPrevious.disabled = !next.connected;
  spotifyNext.disabled = !next.connected;
  spotifyDismiss.disabled = !next.connected;
  if (next.artworkUrl) spotifyArt.src = next.artworkUrl;
  else spotifyArt.removeAttribute('src');
  spotifyProgressBaseMs = Math.max(0, next.positionMs ?? 0);
  spotifyProgressStartedAt = next.playing ? performance.now() : 0;
  renderSpotifyProgress();
  scheduleSpotifyProgress();
  updateSpotifyVisibility();
}

function refreshSpotifyPlayback() {
  const nativePlayback = getSpotifyPlayback();
  if (nativePlayback) setSpotifyPlayback(nativePlayback);
}

function handleSpotifyAction(action: 'previous' | 'play-pause' | 'next') {
  if (!spotifyPlayback.connected) return openSpotify();
  if (!spotifyAction(action)) announce('Spotify-bediening is niet beschikbaar');
  else window.setTimeout(refreshSpotifyPlayback, 100);
}

function tileMarkup(app: LauncherApp, index: number, className: string, selected = false) {
  return `<button class="${className}${selected ? ' is-selected' : ''}" type="button" data-index="${index}" aria-label="${escapeHtml(app.label)}">
    <span class="all-app-icon"><img src="${app.icon}" alt="" /></span><span>${escapeHtml(app.label)}</span>${className === 'home-app-slot' ? '<i aria-hidden="true">✓</i>' : ''}
  </button>`;
}
systemList.innerHTML = systemItems.map(({ icon, label }, index) => `
  <button class="system-item" type="button" data-index="${index}">
    <span class="system-icon" aria-hidden="true">${menuIcon(icon)}</span><span>${label}</span>
  </button>`).join('');

const controller = createFocusController(homeCarouselApps.length, allApps.length, systemItems.length, initialApp, 0);
const state = controller.state;
const keyboardInput = createKeyboardInput();
const INTERNAL_DREAM_IDLE_MS = 75_000;
let internalDreamActive = false;
let idleDreamTimer: number | undefined;
let appButtons: HTMLButtonElement[] = [];
let allAppsButtons: HTMLButtonElement[] = [];
let homeAppsButtons: HTMLButtonElement[] = [];
const systemButtons = [...Array.from(systemList.querySelectorAll<HTMLButtonElement>('button')), stockExit];
const confirmButtons = [confirmNo, confirmYes];
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

function updateGlow() {
  const active = appButtons[state.appIndex];
  if (!active) return;
  const activeRect = active.getBoundingClientRect();
  const stageRect = appStage.getBoundingClientRect();
  glow.style.setProperty('--glow-x', `${activeRect.left + activeRect.width / 2 - stageRect.left}px`);
}

function renderFocus() {
  const inSystem = state.zone === 'system' || state.zone === 'confirm';
  const confirming = state.zone === 'confirm';
  const showingAllApps = state.zone === 'all-apps' || state.zone === 'all-apps-trigger';
  const showingHomeApps = state.zone === 'home-apps' || state.zone === 'home-apps-trigger';
  systemDrawer.hidden = !inSystem;
  allAppsPage.hidden = !showingAllApps;
  homeAppsPage.hidden = !showingHomeApps;
  exitConfirm.hidden = !confirming;
  systemTrigger.setAttribute('aria-expanded', String(inSystem));
  topbar.inert = appStage.inert = inSystem || showingAllApps || showingHomeApps;
  root.classList.toggle('is-collection-page', showingAllApps || showingHomeApps);
  systemDrawer.inert = confirming;
  const groups: [HTMLButtonElement[], Zone, number][] = [
    [appButtons, 'apps', state.appIndex],
    [spotifyButtons, 'spotify', state.spotifyIndex],
    [[allAppsTrigger], 'all-apps-trigger', 0],
    [allAppsButtons, 'all-apps', state.allAppsIndex],
    [[homeAppsTrigger], 'home-apps-trigger', 0],
    [homeAppsButtons, 'home-apps', state.homeAppsIndex],
    [systemButtons, 'system', state.systemIndex],
    [confirmButtons, 'confirm', state.confirmIndex],
  ];
  for (const [buttons, zone, index] of groups) {
    buttons.forEach((button, i) => {
      const active = state.zone === zone && i === index;
      button.classList.toggle('is-active', active);
      button.tabIndex = i === index ? 0 : -1;
    });
  }
  // Home remains a single horizontal rail even when the user adds more than
  // six apps. Keep the focused item in view instead of letting CSS create a
  // second grid row.
  if (state.zone === 'apps') appButtons[state.appIndex]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  homeAppsButtons.forEach((button, index) => button.classList.toggle('is-selected', homeAppIds.includes(allApps[index].id)));
  systemTrigger.classList.toggle('is-active', state.zone === 'system-trigger');
  systemTrigger.tabIndex = 0;
  if (showingAllApps) allAppsButtons[state.allAppsIndex]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  if (showingHomeApps) homeAppsButtons[state.homeAppsIndex]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  updateGlow();
}

function focusedButton(): HTMLButtonElement {
  switch (state.zone) {
    case 'apps': return appButtons[state.appIndex];
    case 'spotify': return spotifyButtons[state.spotifyIndex];
    case 'all-apps-trigger': return allAppsTrigger;
    case 'all-apps': return allAppsButtons[state.allAppsIndex];
    case 'home-apps-trigger': return homeAppsTrigger;
    case 'home-apps': return homeAppsButtons[state.homeAppsIndex];
    case 'system': return systemButtons[state.systemIndex];
    case 'confirm': return confirmButtons[state.confirmIndex];
    case 'system-trigger': return systemTrigger;
  }
}

function syncFocus() {
  renderFocus();
  focusedButton().focus({ preventScroll: true });
}

function setInternalDream(active: boolean) {
  internalDreamActive = active;
  root.classList.toggle('is-dream', dreamMode || active);
  root.setAttribute('aria-label', active || dreamMode ? 'Luna sterrenhemel' : 'Luna projector home');
  updateSpotifyVisibility();
}

function enterInternalDream() {
  if (dreamMode || internalDreamActive) return;
  // Waking must always return to the Home rail. Entering from the drawer must
  // not reveal that drawer again when the next remote input wakes Luna.
  controller.focus('apps', state.appIndex);
  setInternalDream(true);
  window.clearTimeout(idleDreamTimer);
}

function wakeInternalDream() {
  if (!internalDreamActive) return false;
  setInternalDream(false);
  syncFocus();
  armIdleDreamTimer();
  return true;
}

function armIdleDreamTimer() {
  window.clearTimeout(idleDreamTimer);
  if (dreamMode || document.hidden || internalDreamActive) return;
  idleDreamTimer = window.setTimeout(enterInternalDream, INTERNAL_DREAM_IDLE_MS);
}

function noteActivity() {
  if (internalDreamActive) return;
  armIdleDreamTimer();
}

function announce(message: string) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

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

function renderHomeApps() {
  appRow.innerHTML = homeCarouselApps.map((app, index) => `
    <button class="app-slot" type="button" data-index="${index}" data-app-id="${escapeHtml(app.appId ?? '')}" aria-label="${escapeHtml(app.label)}">
      <span class="${app.logo && !app.iconOnly ? 'logo-frame' : 'home-app-icon'}"><img class="${app.logo && !app.iconOnly ? 'logo' : app.iconOnly ? 'luna-app-icon' : ''}" src="${app.logo ? `/assets/logos/${app.logo}.svg` : app.icon}" alt="" /></span>
    </button>`).join('');
  appButtons = Array.from(appRow.querySelectorAll<HTMLButtonElement>('button'));
  appButtons.forEach((button, index) => bindButton(button, 'apps', index));
}

function renderCollectionApps() {
  allAppsGrid.innerHTML = allApps.map((app, index) => tileMarkup(app, index, 'all-app-slot')).join('');
  homeAppsGrid.innerHTML = allApps.map((app, index) => tileMarkup(app, index, 'home-app-slot', homeAppIds.includes(app.id))).join('');
  allAppsButtons = Array.from(allAppsGrid.querySelectorAll<HTMLButtonElement>('button'));
  homeAppsButtons = Array.from(homeAppsGrid.querySelectorAll<HTMLButtonElement>('button'));
  allAppsButtons.forEach((button, index) => bindButton(button, 'all-apps', index));
  homeAppsButtons.forEach((button, index) => bindButton(button, 'home-apps', index));
}

function refreshAvailableApps() {
  const discoveredApps = discoverApps();
  const before = allApps.map(app => app.id).join('|');
  const after = discoveredApps.map(app => app.id).join('|');
  if (before === after) return;
  allApps = discoveredApps;
  homeAppIds = homeAppIds.filter(id => allApps.some(app => app.id === id));
  if (homeAppIds.length === 0) {
    const defaults = allApps.filter(app => app.home === true).map(app => app.id);
    homeAppIds = (defaults.length ? defaults : allApps.map(app => app.id).slice(0, 6));
  }
  savePreference('luna:home-apps', JSON.stringify(homeAppIds));
  homeCarouselApps = homeAppIds.map(id => allApps.find(app => app.id === id)!).filter(Boolean);
  controller.setAppCount(homeCarouselApps.length);
  controller.setAllAppsCount(allApps.length);
  renderHomeApps();
  renderCollectionApps();
}

function launch(app: LauncherApp) {
  return app.component ? launchNativeComponent(app.component) : launchNativeApp(app.appId!);
}

function toggleHomeApp(index: number) {
  const app = allApps[index];
  const isOnHome = homeAppIds.includes(app.id);
  if (isOnHome && homeAppIds.length === 1) {
    announce('Keep at least one app on Luna Home');
    return;
  }
  homeAppIds = isOnHome ? homeAppIds.filter(id => id !== app.id) : [...homeAppIds, app.id];
  savePreference('luna:home-apps', JSON.stringify(homeAppIds));
  homeCarouselApps = homeAppIds.map(id => allApps.find(candidate => candidate.id === id)!).filter(Boolean);
  controller.setAppCount(homeCarouselApps.length);
  renderHomeApps();
  renderCollectionApps();
  announce(isOnHome ? `${app.label} removed from Luna Home` : `${app.label} added to Luna Home`);
}

function applyEffect(effect: Effect | undefined) {
  if (!effect) return;
  if (effect.type === 'app') {
    const app = homeCarouselApps[effect.index];
    savePreference('luna:last-home-app', app.id);
    if (!launch(app)) announce(`${app.label} — niet beschikbaar`);
  } else if (effect.type === 'all-app') {
    const app = allApps[effect.index];
    if (!launch(app)) announce(`${app.label} — niet beschikbaar`);
  } else if (effect.type === 'home-app') {
    toggleHomeApp(effect.index);
  } else if (effect.type === 'stock-exit') {
    if (!exitToNativeStockHome()) announce('Exit to stock UI — projectoradapter volgt via ADB');
  } else if (effect.type === 'spotify') {
    if (effect.index === 3) {
      spotifyPanelDismissed = true;
      updateSpotifyVisibility();
      controller.focus('apps', state.appIndex);
    } else {
      handleSpotifyAction(['previous', 'play-pause', 'next'][effect.index] as 'previous' | 'play-pause' | 'next');
    }
  } else {
    const { label, destination } = systemItems[effect.index];
    if (destination === 'all-apps') controller.focus('all-apps', 0);
    else if (destination === 'screensaver') {
      enterInternalDream();
    } else if (destination === 'spotify-notifications') {
      if (!openNativeSystem(destination)) announce(`${label} — niet beschikbaar`);
    }
    else if (!openNativeSystem(destination)) announce(`${label} — niet beschikbaar`);
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
  if (internalDreamActive && state.zone === 'spotify' && (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'ArrowUp')) {
    event.preventDefault();
    wakeInternalDream();
    return;
  }
  if (internalDreamActive && spotifyShouldShow() && (state.zone === 'spotify' || event.key === 'ArrowDown')) {
    event.preventDefault();
    if (state.zone !== 'spotify') controller.focus('spotify', 1);
    else {
      const action = keyboardInput.read(event.key, event.repeat, performance.now());
      if (action) handleAction(action);
      return;
    }
    syncFocus();
    return;
  }
  if (wakeInternalDream()) {
    event.preventDefault();
    return;
  }
  noteActivity();
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

renderHomeApps();
renderCollectionApps();
bindButton(allAppsTrigger, 'all-apps-trigger');
bindButton(homeAppsTrigger, 'home-apps-trigger');
systemButtons.forEach((button, index) => bindButton(button, 'system', index));
confirmButtons.forEach((button, index) => bindButton(button, 'confirm', index));
bindButton(systemTrigger, 'system-trigger');
spotifyButtons.forEach((button, index) => bindButton(button, 'spotify', index));
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
    if (pressed && (!wasPressed || (navigation && now - lastGamepadNavigationAt >= 55))) {
      if (internalDreamActive) {
        wakeInternalDream();
      } else {
        noteActivity();
        handleAction(action);
      }
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
  if (document.hidden) {
    stopGamepadPolling();
    window.clearTimeout(clockTimer);
    window.clearTimeout(toastTimer);
    toast.classList.remove('is-visible');
  } else {
    updateClock();
    startGamepadPolling();
    armIdleDreamTimer();
  }
}
document.addEventListener('pointerdown', noteActivity, { passive: true });
document.addEventListener('visibilitychange', updateVisibility);
window.addEventListener('luna:spotify-playback', refreshSpotifyPlayback);
window.addEventListener('gamepadconnected', startGamepadPolling);
window.addEventListener('gamepaddisconnected', () => { stopGamepadPolling(); startGamepadPolling(); });
window.addEventListener('pagehide', () => { stopGamepadPolling(); window.clearTimeout(clockTimer); });
window.addEventListener('pageshow', updateVisibility);
window.addEventListener('resize', updateGlow);
appRow.addEventListener('scroll', updateGlow, { passive: true });
window.addEventListener('luna:refresh-apps', () => {
  refreshAvailableApps();
  if (!document.hidden) syncFocus();
});

updateVisibility();
refreshSpotifyPlayback();
syncFocus();

// One continuously rendered liquid composition. The source images are only
// ingredients; the projector receives one canvas surface, never slide-like scenes.
const skyCanvas = document.querySelector<HTMLCanvasElement>('.ambient-canvas')!;
const skyContext = skyCanvas.getContext('2d', { alpha: false });
const skyImages = [
  '/assets/backgrounds/luna-cloudscape-v1.png',
  '/assets/backgrounds/luna-milky-way-v1.png',
  '/assets/backgrounds/luna-cloudscape-v2.png',
  '/assets/backgrounds/luna-cloudscape-v3.png',
].map(src => { const image = new Image(); image.src = src; return image; });
const skyMotion = skyImages.map((_, index) => ({ phase: index * 1.7 + Math.random(), speed: .000065 + Math.random() * .000055, targetSpeed: .00008, scale: 1.10 + Math.random() * .16, alpha: .16 + Math.random() * .10, targetAlpha: .20, targetScale: 1.16, angle: 0, targetAngle: 0, orbitX: .095, orbitY: .075, targetOrbitX: .095, targetOrbitY: .075, wobble: .37, targetWobble: .37 }));
const skyMoods = [
  ['rgba(82,44,111,.08)', 'rgba(20,38,61,.04)'],
  ['rgba(55,71,126,.08)', 'rgba(26,33,72,.05)'],
  ['rgba(47,91,96,.07)', 'rgba(31,38,70,.05)'],
  ['rgba(92, 50, 126, .07)', 'rgba(23, 42, 74, .05)'],
] as const;
let skyMood = 0;
let targetSkyMood = 0;
const skyParticles = Array.from({ length: 9 }, (_, index) => ({ x: Math.random(), y: Math.random(), phase: index * 1.3 + Math.random(), size: .7 + Math.random() * 1.2 }));
let nextSkyVariation = performance.now() + 45000;
let skyFrame = 0;
let lastSkyPaint = 0;
let auroraUntil = 0;
let auroraSeed = Math.random() * 100;
let thunderUntil = 0;
let thunderSeed = 0;
let warmUntil = 0;
let warmSeed = 0;
function scheduleAurora() {
  window.setTimeout(() => {
    auroraSeed = Math.random() * 100;
    auroraUntil = performance.now() + 26000;
    scheduleAurora();
  }, 90000 + Math.random() * 120000);
}
scheduleAurora();
function scheduleThunder() {
  window.setTimeout(() => {
    thunderSeed = Math.random() * 100;
    thunderUntil = performance.now() + 1700;
    scheduleThunder();
  }, 110000 + Math.random() * 170000);
}
scheduleThunder();
function scheduleWarmEmber() {
  window.setTimeout(() => {
    warmSeed = Math.random() * 100;
    warmUntil = performance.now() + 24000;
    scheduleWarmEmber();
  }, 180000 + Math.random() * 240000);
}
scheduleWarmEmber();
function paintLiquidSky(time: number) {
  if (!skyContext) return;
  if (time - lastSkyPaint < 33) { skyFrame = requestAnimationFrame(paintLiquidSky); return; }
  lastSkyPaint = time;
  const width = skyCanvas.clientWidth || 1280, height = skyCanvas.clientHeight || 720;
  const ratio = Math.min(window.devicePixelRatio || 1, 1);
  if (skyCanvas.width !== Math.round(width * ratio) || skyCanvas.height !== Math.round(height * ratio)) { skyCanvas.width = Math.round(width * ratio); skyCanvas.height = Math.round(height * ratio); }
  skyContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (time > nextSkyVariation) {
    skyMotion.forEach(motion => { motion.targetAlpha = .14 + Math.random() * .13; motion.targetScale = 1.08 + Math.random() * .20; motion.targetSpeed = .000055 + Math.random() * .000075; motion.targetAngle = (Math.random() - .5) * .018; motion.targetOrbitX = .055 + Math.random() * .08; motion.targetOrbitY = .045 + Math.random() * .065; motion.targetWobble = .22 + Math.random() * .55; });
    targetSkyMood = Math.floor(Math.random() * skyMoods.length);
    nextSkyVariation = time + 45000 + Math.random() * 50000;
  }
  skyContext.fillStyle = '#080b14'; skyContext.fillRect(0, 0, width, height);
  skyImages.forEach((image, index) => {
    if (!image.complete || !image.naturalWidth) return;
    const motion = skyMotion[index]!, drift = time * motion.speed + motion.phase;
    motion.alpha += (motion.targetAlpha - motion.alpha) * .0012;
    motion.scale += (motion.targetScale - motion.scale) * .0012;
    motion.speed += (motion.targetSpeed - motion.speed) * .0008;
    motion.angle += (motion.targetAngle - motion.angle) * .001;
    motion.orbitX += (motion.targetOrbitX - motion.orbitX) * .001;
    motion.orbitY += (motion.targetOrbitY - motion.orbitY) * .001;
    motion.wobble += (motion.targetWobble - motion.wobble) * .001;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * motion.scale;
    const drawWidth = image.naturalWidth * scale, drawHeight = image.naturalHeight * scale;
    const x = (width - drawWidth) / 2 + Math.sin(drift) * width * motion.orbitX + Math.sin(drift * motion.wobble) * width * .025;
    const y = (height - drawHeight) / 2 + Math.cos(drift * .83) * height * motion.orbitY + Math.cos(drift * .29) * height * .018;
    skyContext.globalAlpha = motion.alpha + Math.sin(drift * .61) * .055;
    skyContext.globalCompositeOperation = index === 0 ? 'source-over' : 'screen';
    skyContext.save();
    skyContext.translate(width / 2, height / 2); skyContext.rotate(motion.angle); skyContext.translate(-width / 2, -height / 2);
    skyContext.drawImage(image, x, y, drawWidth, drawHeight);
    skyContext.restore();
  });
  skyContext.globalCompositeOperation = 'source-over'; skyContext.globalAlpha = 1;
  skyMood += (targetSkyMood - skyMood) * .0006;
  const moodA = skyMoods[Math.floor(skyMood)]!, moodB = skyMoods[Math.min(skyMoods.length - 1, Math.ceil(skyMood))]!;
  const wash = skyContext.createRadialGradient(width * .42, height * .35, 0, width * .52, height * .5, width * .7);
  wash.addColorStop(0, moodA[0]); wash.addColorStop(.55, moodB[1]); wash.addColorStop(1, 'rgba(2,5,12,.34)');
  skyContext.fillStyle = wash; skyContext.fillRect(0, 0, width, height);
  skyContext.globalCompositeOperation = 'screen';
  skyContext.globalAlpha = .28;
  skyParticles.forEach(particle => {
    const drift = time * .000018 + particle.phase;
    const x = ((particle.x + Math.sin(drift) * .035) % 1) * width;
    const y = ((particle.y + Math.cos(drift * .7) * .025) % 1) * height;
    skyContext.fillStyle = 'rgba(190, 216, 226, .7)';
    skyContext.beginPath(); skyContext.arc(x, y, particle.size, 0, Math.PI * 2); skyContext.fill();
  });
  skyContext.globalCompositeOperation = 'source-over'; skyContext.globalAlpha = 1;
  if (time < warmUntil) {
    const progress = Math.min(1, Math.max(0, 1 - (warmUntil - time) / 24000));
    const fade = Math.min(progress / .24, (1 - progress) / .30);
    skyContext.globalCompositeOperation = 'screen'; skyContext.globalAlpha = .055 * Math.max(0, fade);
    const ember = skyContext.createRadialGradient(width * (.2 + (warmSeed % 1) * .6), height * (.35 + ((warmSeed * .37) % 1) * .35), 0, width * .52, height * .5, width * .6);
    ember.addColorStop(0, 'rgba(188, 78, 48, .62)'); ember.addColorStop(.3, 'rgba(145, 61, 72, .18)'); ember.addColorStop(1, 'transparent');
    skyContext.fillStyle = ember; skyContext.fillRect(0, 0, width, height);
    skyContext.globalCompositeOperation = 'source-over'; skyContext.globalAlpha = 1;
  }
  if (time < auroraUntil) {
    const progress = Math.min(1, Math.max(0, 1 - (auroraUntil - time) / 26000));
    const fade = Math.min(progress / .18, (1 - progress) / .28);
    skyContext.globalCompositeOperation = 'screen';
    skyContext.globalAlpha = .12 * Math.max(0, fade);
    for (let band = 0; band < 2; band += 1) {
      const x = width * (.28 + band * .42) + Math.sin(time * .00018 + auroraSeed + band) * width * .08;
      const gradient = skyContext.createLinearGradient(x, height * .08, x + width * .18, height * .9);
      gradient.addColorStop(0, band ? 'rgba(106, 177, 176, .72)' : 'rgba(130, 104, 190, .68)');
      gradient.addColorStop(.48, band ? 'rgba(82, 157, 190, .16)' : 'rgba(95, 174, 157, .18)');
      gradient.addColorStop(1, 'transparent');
      skyContext.fillStyle = gradient;
      skyContext.fillRect(0, 0, width, height);
    }
    skyContext.globalCompositeOperation = 'source-over';
    skyContext.globalAlpha = 1;
  }
  if (time < thunderUntil) {
    const elapsed = 1 - (thunderUntil - time) / 1700;
    const pulse = Math.max(0, Math.sin(elapsed * Math.PI * 3 + thunderSeed) ** 8);
    skyContext.globalCompositeOperation = 'screen';
    skyContext.globalAlpha = .12 * pulse;
    const cloudFlash = skyContext.createRadialGradient(width * (.25 + (thunderSeed % 1) * .5), height * .28, 0, width * .5, height * .38, width * .55);
    cloudFlash.addColorStop(0, 'rgba(196, 215, 232, .72)'); cloudFlash.addColorStop(.22, 'rgba(125, 161, 192, .24)'); cloudFlash.addColorStop(1, 'transparent');
    skyContext.fillStyle = cloudFlash; skyContext.fillRect(0, 0, width, height);
    skyContext.globalCompositeOperation = 'source-over'; skyContext.globalAlpha = 1;
  }
  skyFrame = requestAnimationFrame(paintLiquidSky);
}
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) skyFrame = requestAnimationFrame(paintLiquidSky);
window.addEventListener('pagehide', () => cancelAnimationFrame(skyFrame));

armIdleDreamTimer();
