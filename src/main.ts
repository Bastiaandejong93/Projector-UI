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
      <svg class="spotify-glass-outline" viewBox="0 0 1000 400" aria-hidden="true">
        <defs>
          <clipPath id="spotify-glass-clip" clipPathUnits="objectBoundingBox"><path d="M .2 .025 C .095 .025 .01 .2375 .01 .5 C .01 .7625 .095 .975 .2 .975 C .278 .975 .322 .86 .368 .755 C .438 .6 .503 .6 .576 .685 C .629 .7475 .652 .8125 .72 .8125 L .888 .8125 C .958 .8125 .99 .695 .99 .5 C .99 .305 .958 .1875 .888 .1875 L .72 .1875 C .652 .1875 .629 .2525 .576 .315 C .503 .4 .438 .4 .368 .245 C .322 .14 .278 .025 .2 .025 Z"/></clipPath>
          <linearGradient id="spotify-glass-rim" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="white" stop-opacity=".22"/><stop offset=".23" stop-color="white" stop-opacity=".035"/><stop offset=".5" stop-color="white" stop-opacity=".15"/><stop offset=".75" stop-color="white" stop-opacity=".025"/><stop offset="1" stop-color="white" stop-opacity=".16"/></linearGradient>
          <filter id="spotify-rim-soft" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="2.5"/></filter>
          <path id="spotify-glass-shape" d="M 200 10 C 95 10 10 95 10 200 C 10 305 95 390 200 390 C 278 390 322 344 368 302 C 438 240 503 240 576 274 C 629 299 652 325 720 325 L 888 325 C 958 325 990 278 990 200 C 990 122 958 75 888 75 L 720 75 C 652 75 629 101 576 126 C 503 160 438 160 368 98 C 322 56 278 10 200 10 Z"/>
        </defs>
        <use href="#spotify-glass-shape" fill="none" stroke="url(#spotify-glass-rim)" stroke-width="9" opacity=".055"/>
        <use href="#spotify-glass-shape" fill="none" stroke="url(#spotify-glass-rim)" stroke-width="2" opacity=".42"/>
        <g fill="none" stroke="white" stroke-linecap="round" pointer-events="none">
          <path d="M 33 126 C 63 51 132 17 200 17 M 728 82 L 880 82 C 927 82 950 100 965 133 M 693 315 C 741 323 821 318 887 318 C 940 318 967 284 978 248" stroke-width="7" opacity=".045" filter="url(#spotify-rim-soft)"/>
          <path d="M 53 89 C 86 44 137 19 181 17 M 805 79 L 875 79 M 744 321 L 883 321" stroke-width="1.5" opacity=".11"/>
        </g>
        <g class="spotify-glass-wave" fill="none" stroke="white" stroke-width="1" opacity=".1">
          <path d="M350 182 C425 120 480 263 630 169"/><path d="M350 198 C435 140 485 277 640 187"/><path d="M350 214 C435 155 490 282 630 205"/>
          <path d="M365 190 C435 140 480 263 620 182" stroke-dasharray="1 12" stroke-linecap="round" stroke-width="3"/>
          <path d="M365 220 C435 160 490 280 620 212" stroke-dasharray="1 17" stroke-linecap="round" stroke-width="2"/>
        </g>
      </svg><div class="spotify-glass-surface" aria-hidden="true"></div>
      <button class="spotify-art" type="button" aria-label="Open Spotify"><img alt="" /></button>
      <div class="spotify-player">
        <div class="spotify-bubble-track"><div class="spotify-title-row"><strong class="spotify-track-title">Luister op je TV</strong><button class="spotify-dismiss" type="button" aria-label="Spotify-paneel verbergen">×</button></div><span class="spotify-track-artist">Verbind Spotify om af te spelen</span></div>
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
const spotifyArtButton = document.querySelector<HTMLButtonElement>('.spotify-art')!;
// One horizontal focus rail: artwork → previous → play/pause → next. The
// close button is reached with Up and remains in the same zone, so arrows do
// not accidentally wake the home screen.
const spotifyButtons = [spotifyArtButton, spotifyPrevious, spotifyConnect, spotifyNext, spotifyDismiss];
let spotifyPlayback: SpotifyPlayback = { connected: false, playing: false, title: 'Luister op je TV', artist: 'Verbind Spotify om af te spelen' };
let spotifyPanelDismissed = false;
let spotifyProgressBaseMs = 0;
let spotifyProgressStartedAt = 0;
let spotifyProgressTimer: number | undefined;
let spotifyArtRotationDegrees = 0;
let spotifyArtAnimationFrame = 0;
let spotifyArtLastFrameAt = 0;
let spotifyArtIsPlaying = false;

const SPOTIFY_ART_ROTATION_PERIOD_MS = 28_000;

function renderSpotifyArtRotation(timestamp: number) {
  if (!spotifyArtIsPlaying) {
    spotifyArtAnimationFrame = 0;
    return;
  }
  if (spotifyArtLastFrameAt === 0) spotifyArtLastFrameAt = timestamp;
  const elapsed = Math.min(100, Math.max(0, timestamp - spotifyArtLastFrameAt));
  spotifyArtRotationDegrees = (spotifyArtRotationDegrees + elapsed / SPOTIFY_ART_ROTATION_PERIOD_MS * 360) % 360;
  spotifyArtLastFrameAt = timestamp;
  const wavePhase = spotifyArtRotationDegrees * Math.PI / 180;
  // Shared phase locks the waist's motion to the artwork and freezes on pause.
  spotifyBubble.style.setProperty('--spotify-wave-y', `${Math.sin(wavePhase) * 7}px`);
  spotifyBubble.style.setProperty('--spotify-wave-scale', `${1 + Math.cos(wavePhase) * .1}`);
  spotifyBubble.style.setProperty('--spotify-wave-phase', `${-spotifyArtRotationDegrees / 12}`);
  spotifyArt.style.transform = `scale(1.02) rotate(${spotifyArtRotationDegrees}deg)`;
  spotifyArtAnimationFrame = window.requestAnimationFrame(renderSpotifyArtRotation);
}

function setSpotifyArtPlaying(playing: boolean) {
  if (spotifyArtIsPlaying === playing) return;
  spotifyArtIsPlaying = playing;
  if (!playing) {
    window.cancelAnimationFrame(spotifyArtAnimationFrame);
    spotifyArtAnimationFrame = 0;
    spotifyArtLastFrameAt = 0;
    return;
  }
  spotifyArtLastFrameAt = 0;
  spotifyArtAnimationFrame = window.requestAnimationFrame(renderSpotifyArtRotation);
}

function spotifyApp() {
  return allApps.find(app => /spotify/i.test(app.label) || app.component?.startsWith('com.spotify.'));
}

function openSpotify() {
  const app = spotifyApp();
  if (app?.component && launchNativeComponent(app.component)) return;
  announce('Spotify is niet geïnstalleerd op deze projector');
}

function spotifyShouldShow() {
  return (dreamMode || internalDreamActive) && spotifyPlayback.connected && (spotifyPlayback.playing || spotifyBubble.classList.contains('is-active')) && !spotifyPanelDismissed;
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
  if (visible && internalDreamActive && state.zone !== 'spotify') controller.focus('spotify', 2);
  if (appButtons.length) renderFocus();
}

// Long metadata travels slowly inside its own line, without clipping descenders.
function scrollSpotifyText(element: HTMLElement) {
  const text = element.firstElementChild as HTMLElement | null;
  if (!text) return;
  text.getAnimations().forEach(animation => animation.cancel());
  const distance = text.scrollWidth - element.clientWidth;
  if (distance <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  text.animate([
    { transform: 'translateX(0)', offset: 0 },
    { transform: 'translateX(0)', offset: .18 },
    { transform: `translateX(-${distance}px)`, offset: .82 },
    { transform: `translateX(-${distance}px)`, offset: 1 },
  ], { duration: Math.max(8000, distance * 65), iterations: Infinity, direction: 'alternate', easing: 'linear' });
}
function setSpotifyText(element: HTMLElement, value: string) {
  if (element.textContent === value && element.firstElementChild) return;
  const text = document.createElement('span');
  text.className = 'spotify-scroll-text';
  text.textContent = value;
  element.replaceChildren(text);
  element.title = value;
  requestAnimationFrame(() => scrollSpotifyText(element));
}
const spotifyTextObserver = new ResizeObserver(entries => entries.forEach(entry => scrollSpotifyText(entry.target as HTMLElement)));
spotifyTextObserver.observe(spotifyTrackTitle);
spotifyTextObserver.observe(spotifyTrackArtist);

function setSpotifyPlayback(next: SpotifyPlayback) {
  spotifyPlayback = next;
  if (!next.connected) spotifyPanelDismissed = false;
  spotifyBubble.classList.toggle('is-playing', next.playing);
  spotifyBubble.classList.toggle('has-art', Boolean(next.artworkUrl));
  setSpotifyText(spotifyTrackTitle, next.connected ? next.title : 'Luister op je TV');
  setSpotifyText(spotifyTrackArtist, next.connected ? next.artist : 'Verbind Spotify om af te spelen');
  spotifyConnect.setAttribute('aria-label', next.playing ? 'Pauzeren' : 'Afspelen');
  spotifyPauseGlyph.classList.toggle('is-playing', next.playing);
  spotifyPauseGlyph.setAttribute('aria-label', next.playing ? 'Pauzeren' : 'Afspelen');
  spotifyPrevious.disabled = !next.connected;
  spotifyNext.disabled = !next.connected;
  spotifyDismiss.disabled = !next.connected;
  spotifyArtButton.disabled = !next.connected;
  const currentArtwork = spotifyArt.getAttribute('src');
  if (next.artworkUrl && currentArtwork !== next.artworkUrl) spotifyArt.src = next.artworkUrl;
  else if (!next.artworkUrl && currentArtwork) spotifyArt.removeAttribute('src');
  setSpotifyArtPlaying(Boolean(next.artworkUrl) && next.playing);
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

function enableSpotifyPreview() {
  if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get('spotifyPreview') !== '1') return;
  setInternalDream(true);
  setSpotifyPlayback({
    connected: true,
    playing: true,
    title: 'Midnight City',
    artist: 'M83',
    artworkUrl: '/assets/backgrounds/luna-milky-way-v1.png',
    positionMs: 42_000,
    durationMs: 243_000,
  });
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
  resetSkyEvents(performance.now());
  root.setAttribute('aria-label', active || dreamMode ? 'Luna sterrenhemel' : 'Luna projector home');
  updateSpotifyVisibility();
}

function enterInternalDream() {
  if (dreamMode || internalDreamActive) return;
  // Dismissing the bubble only applies to the current screensaver session.
  // Show it again when a new screensaver session starts during playback.
  spotifyPanelDismissed = false;
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
    if (effect.index === 0) {
      openSpotify();
    } else if (effect.index === 4) {
      // Closing the Spotify bubble is an explicit stop action: pause active
      // playback before returning to Luna Home.
      if (spotifyPlayback.playing) handleSpotifyAction('play-pause');
      spotifyPanelDismissed = true;
      updateSpotifyVisibility();
      controller.focus('apps', state.appIndex);
      if (internalDreamActive) wakeInternalDream();
    } else {
      handleSpotifyAction(['previous', 'play-pause', 'next'][effect.index - 1] as 'previous' | 'play-pause' | 'next');
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
  if (internalDreamActive && state.zone === 'spotify' && (event.key === 'Escape' || event.key === 'Backspace')) {
    event.preventDefault();
    wakeInternalDream();
    return;
  }
  if (internalDreamActive && spotifyShouldShow() && (state.zone === 'spotify' || event.key === 'ArrowDown')) {
    event.preventDefault();
    if (state.zone !== 'spotify') controller.focus('spotify', 2);
    else {
      if (event.key === 'ArrowUp') {
        controller.focus('spotify', 4);
        syncFocus();
        return;
      }
      if (event.key === 'ArrowDown' && state.spotifyIndex === 4) {
        controller.focus('spotify', 2);
        syncFocus();
        return;
      }
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
        if (spotifyShouldShow()) {
          if (state.zone !== 'spotify') controller.focus('spotify', action === 'down' ? 2 : state.spotifyIndex);
          if (action === 'up') {
            controller.focus('spotify', 4);
          } else if (action === 'down' && state.spotifyIndex === 4) {
            controller.focus('spotify', 2);
          }
          else if (action !== 'back') handleAction(action);
          else wakeInternalDream();
          syncFocus();
        } else {
          wakeInternalDream();
        }
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
window.addEventListener('luna:home-button', () => {
  spotifyPanelDismissed = false;
  if (internalDreamActive) wakeInternalDream();
  controller.focus('apps', state.appIndex);
  syncFocus();
});
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

// The dream uses one deliberately budgeted canvas. It is not a shader pipeline:
// an Android TV WebView composites two source images at 24 fps and 960x540 max.
const skyCanvas = document.querySelector<HTMLCanvasElement>('.ambient-canvas')!;
const skyContext = skyCanvas.getContext('2d', { alpha: false });
const skyReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isSkyDream = () => dreamMode || internalDreamActive;
const skyImages = [
  '/assets/backgrounds/luna-cloudscape-v1.png',
  '/assets/backgrounds/luna-milky-way-v1.png',
  '/assets/backgrounds/luna-cloudscape-v2.png',
  '/assets/backgrounds/luna-cloudscape-v3.png',
].map(src => { const image = new Image(); image.src = src; return image; });
const SKY_FRAME_INTERVAL_MS = 1000 / 40;
const SKY_MAX_RENDER_WIDTH = 960;
const SKY_MAX_RENDER_HEIGHT = 540;
const SKY_RETARGET_HOME_MS = 240_000;
const SKY_RETARGET_DREAM_MS = 150_000;
type SkyMotion = {
  phase: number; wobblePhase: number; speed: number; targetSpeed: number; scale: number; targetScale: number;
  orbitX: number; orbitY: number; targetOrbitX: number; targetOrbitY: number;
  wobble: number; targetWobble: number;
};
// One shared motion field keeps the cloud direction coherent. Targets move only
// a few percentage points at a time, so no random left/right lurches are visible.
const skyMotion: SkyMotion = {
  phase: Math.random() * Math.PI * 2,
  wobblePhase: .7,
  speed: .00022,
  targetSpeed: .00022,
  scale: 1.16,
  targetScale: 1.16,
  orbitX: .074,
  orbitY: .054,
  targetOrbitX: .074,
  targetOrbitY: .054,
  wobble: .38,
  targetWobble: .38,
};
const skyMoods = [
  ['rgba(82,44,111,.08)', 'rgba(20,38,61,.04)'],
  ['rgba(55,71,126,.08)', 'rgba(26,33,72,.05)'],
  ['rgba(47,91,96,.07)', 'rgba(31,38,70,.05)'],
  ['rgba(92, 50, 126, .07)', 'rgba(23, 42, 74, .05)'],
  ['rgba(104,67,104,.075)', 'rgba(25,45,70,.045)'],
  ['rgba(57,88,105,.07)', 'rgba(33,33,66,.05)'],
] as const;
// Home keeps its restrained blue-violet register. Dream mode can explore a
// wider range without changing the launcher's everyday atmosphere.
const dreamSkyMoods = [
  ...skyMoods,
  ['rgba(151,64,91,.11)', 'rgba(54,25,61,.07)'],
  ['rgba(198,112,55,.10)', 'rgba(47,31,55,.07)'],
  ['rgba(44,128,128,.10)', 'rgba(19,59,77,.07)'],
  ['rgba(92,70,164,.11)', 'rgba(26,31,83,.07)'],
  ['rgba(174,91,139,.09)', 'rgba(38,29,72,.07)'],
  ['rgba(31,116,83,.18)', 'rgba(13,55,57,.12)'],
  ['rgba(151,76,35,.17)', 'rgba(72,30,42,.12)'],
  ['rgba(43,86,158,.18)', 'rgba(24,42,86,.12)'],
  ['rgba(122,44,71,.17)', 'rgba(58,21,53,.12)'],
  ['rgba(103,105,47,.15)', 'rgba(29,63,58,.11)'],
] as const;
let skyMood = 0;
let targetSkyMood = 0;
let skyBaseImage = 0;
let skyOverlayImage = 1;
let skyImageBlend = 1;
let nextSkyVariation = performance.now() + 150_000;
let skyFrame = 0;
let lastSkyPaint = 0;
let skyLastTime = performance.now();
type SkyFeatureKind = 'aurora' | 'moon-limb' | 'ringed-planet';
type SkyMicroEventKind = 'firefly' | 'meteor' | 'satellite' | 'constellation' | 'beacon';
type SkyFeature = { kind: SkyFeatureKind; startsAt: number; endsAt: number; seed: number; palette: number };
type SkyMicroEvent = { kind: SkyMicroEventKind; startsAt: number; endsAt: number; seed: number };
const skyFeatureCatalogue: readonly SkyFeatureKind[] = ['aurora', 'moon-limb', 'ringed-planet'];
const skyMicroEventCatalogue: readonly SkyMicroEventKind[] = ['firefly', 'meteor', 'satellite', 'constellation', 'beacon'];
let activeSkyFeature: SkyFeature | null = null;
let activeSkyMicroEvent: SkyMicroEvent | null = null;
let nextSkyFeatureAt = 0;
let nextAuroraAt = 0;
let nextSkyMicroEventAt = 0;
let lastSkyFeatureEndedAt = -Infinity;
// Low-alpha colour gathers around the curtain's lower folds. Feather shells
// do not overlap within a sheet, avoiding accumulated 8-bit gradient dithering.
const auroraPalettes = [
  ['83,167,145', '114,96,163', '165,128,83'],
  ['111,95,165', '72,151,143', '159,119,90'],
  ['159,128,83', '81,148,136', '119,98,156'],
] as const;
const skyMicroDurations: Record<SkyMicroEventKind, number> = {
  firefly: 11_000, meteor: 3_700, satellite: 18_000, constellation: 12_000, beacon: 10_000,
};
// DEV-only staging uses the real renderers and holds the sky still. Examples:
// ?mode=dream&skyPreview=aurora or moon, planet, constellation, beacon, meteor,
// satellite, firefly. Add +satellite for coexistence, skyProgress=0..1 to inspect
// an envelope, or skyBackground=0..3 to check the existing sky assets.
const skyPreviewParams = import.meta.env.DEV && dreamMode ? new URLSearchParams(window.location.search) : null;
const skyPreviewNames = skyPreviewParams?.get('skyPreview')?.replace(/ /g, '+').split('+') ?? [];
const previewFeatureName = skyPreviewNames.find(name => skyFeatureCatalogue.includes(name as SkyFeatureKind) || ['moon', 'planet'].includes(name) || /^aurora-(teal|violet|amber)$/.test(name));
const previewFeature: SkyFeatureKind | undefined = previewFeatureName?.startsWith('aurora') ? 'aurora'
  : previewFeatureName === 'moon' ? 'moon-limb' : previewFeatureName === 'planet' ? 'ringed-planet' : previewFeatureName as SkyFeatureKind | undefined;
const previewMicro = skyPreviewNames.find(name => skyMicroEventCatalogue.includes(name as SkyMicroEventKind)) as SkyMicroEventKind | undefined;
const skyPreview = Boolean(previewFeature || previewMicro || skyPreviewNames.includes('none'));
const previewPalette = Math.max(0, ['aurora-teal', 'aurora-violet', 'aurora-amber'].indexOf(previewFeatureName ?? ''));
const previewProgressValue = Number(skyPreviewParams?.get('skyProgress') ?? .55);
const previewProgress = Number.isFinite(previewProgressValue) ? Math.max(0, Math.min(1, previewProgressValue)) : .55;
if (skyPreview) {
  skyMotion.phase = 1.2;
  const background = Number(skyPreviewParams?.get('skyBackground') ?? 1);
  skyBaseImage = skyOverlayImage = Number.isInteger(background) && background >= 0 && background < skyImages.length ? background : 1;
}

function resetSkyEvents(time: number) {
  activeSkyFeature = null;
  activeSkyMicroEvent = null;
  lastSkyFeatureEndedAt = time;
  nextAuroraAt = time + 240_000 + Math.random() * 300_000;
  nextSkyFeatureAt = time + 180_000 + Math.random() * 240_000;
  nextSkyMicroEventAt = time + 240_000 + Math.random() * 300_000;
}

function pickDifferentImage(current: number) {
  // Home favours the cloudscape family, while Dream keeps the full, even
  // catalogue including the Milky Way. The same single-canvas crossfade is
  // used in both modes.
  const candidates = isSkyDream() ? [0, 1, 2, 3] : [0, 0, 0, 1, 2, 2, 3, 3];
  const available = candidates.filter(index => index !== current);
  return available[Math.floor(Math.random() * available.length)]!;
}
function smoothToward(current: number, target: number, amount: number) {
  return current + (target - current) * amount;
}
function retargetSky(time: number) {
  const dream = isSkyDream();
  skyMotion.targetSpeed = Math.max(.00018, Math.min(.00028, skyMotion.speed + (Math.random() - .5) * .000032));
  skyMotion.targetScale = Math.max(1.11, Math.min(1.22, skyMotion.scale + (Math.random() - .5) * .045));
  skyMotion.targetOrbitX = Math.max(.05, Math.min(.10, skyMotion.orbitX + (Math.random() - .5) * .022));
  skyMotion.targetOrbitY = Math.max(.035, Math.min(.075, skyMotion.orbitY + (Math.random() - .5) * .016));
  skyMotion.targetWobble = Math.max(.24, Math.min(.54, skyMotion.wobble + (Math.random() - .5) * .12));
  const moods = dream ? dreamSkyMoods : skyMoods;
  targetSkyMood = Math.floor(Math.random() * moods.length);
  if (dream && skyImageBlend >= 1 && skyImages.every(image => image.complete && image.naturalWidth > 0)) {
    skyBaseImage = skyOverlayImage;
    skyOverlayImage = pickDifferentImage(skyBaseImage);
    skyImageBlend = 0;
  }
  nextSkyVariation = time + (dream ? SKY_RETARGET_DREAM_MS : SKY_RETARGET_HOME_MS) + Math.random() * (dream ? 90_000 : 120_000);
}

function featureDuration(kind: SkyFeatureKind) {
  return kind === 'aurora' ? 35_000 + Math.random() * 20_000 : 38_000 + Math.random() * 22_000;
}
function startSkyFeature(time: number) {
  if (time - lastSkyFeatureEndedAt < 45_000) return;
  // Aurora owns a 4–9 minute start-to-start clock. Celestial features only
  // use an open gap that leaves room for their fade and a quiet interval.
  const auroraDue = time >= nextAuroraAt;
  if (!auroraDue && (time < nextSkyFeatureAt || nextAuroraAt - time < 105_000)) return;
  const kind: SkyFeatureKind = auroraDue ? 'aurora' : Math.random() < .5 ? 'moon-limb' : 'ringed-planet';
  activeSkyFeature = { kind, startsAt: time, endsAt: time + featureDuration(kind), seed: Math.random() * 100, palette: Math.floor(Math.random() * auroraPalettes.length) };
  if (auroraDue) nextAuroraAt = time + 240_000 + Math.random() * 300_000;
}
function startSkyMicroEvent(time: number) {
  const kind = skyMicroEventCatalogue[Math.floor(Math.random() * skyMicroEventCatalogue.length)]!;
  activeSkyMicroEvent = { kind, startsAt: time, endsAt: time + skyMicroDurations[kind], seed: Math.random() * 100 };
}

function drawSkyImage(image: HTMLImageElement, width: number, height: number, opacity: number, composite: GlobalCompositeOperation) {
  if (!image.complete || !image.naturalWidth) return;
  const drift = skyMotion.phase;
  // Overscan must cover the maximum shared drift on both axes, even at
  // the smallest target scale. Otherwise the orbit exposes dark edge strips.
  const overscan = Math.max(skyMotion.scale, 1 + 2 * (skyMotion.orbitX + .012), 1 + 2 * (skyMotion.orbitY + .009));
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * overscan;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = (width - drawWidth) / 2 + Math.sin(drift) * width * skyMotion.orbitX + Math.sin(skyMotion.wobblePhase) * width * .012;
  const y = (height - drawHeight) / 2 + Math.cos(drift * .83) * height * skyMotion.orbitY + Math.cos(drift * .29) * height * .009;
  skyContext!.globalCompositeOperation = composite;
  skyContext!.globalAlpha = opacity;
  skyContext!.drawImage(image, x, y, drawWidth, drawHeight);
}
function featureOpacity(feature: SkyFeature, time: number) {
  const progress = (time - feature.startsAt) / (feature.endsAt - feature.startsAt);
  const fade = Math.max(0, Math.min(1, progress / .26, (1 - progress) / .30));
  return fade * fade * (3 - 2 * fade);
}
function drawSkyFeature(feature: SkyFeature, width: number, height: number, time: number) {
  const ctx = skyContext!;
  const opacity = featureOpacity(feature, time);
  if (opacity <= 0) return;
  ctx.save();
  if (feature.kind === 'aurora') {
    const colors = auroraPalettes[feature.palette]!;
    const age = (time - feature.startsAt) / 1000;
    ctx.globalCompositeOperation = 'screen';
    // Three asymmetrical sheets. Each closes at pointed, transparent tips;
    // independent upper/lower Beziers vary the height along every fold.
    // Sixteen disjoint contour shells feather both edges without filters or
    // bitmaps; only the three sheets overlap, so quantization cannot pile up.
    for (let index = 0; index < 3; index += 1) {
      const phase = feature.seed + index * 2.1;
      const drift = Math.sin(age * .025 + phase) * 2;
      ctx.save();
      ctx.translate(drift * width / 960, (drift * .6 + index * -19) * height / 540);
      ctx.scale(width / 960, height / 540);
      const offset = index * 38;
      const lean = Math.sin(phase) * 12;
      const ribbon = ctx.createLinearGradient(95 + offset, 0, 865 - offset * .5, 0);
      ribbon.addColorStop(0, `rgba(${colors[0]},0)`);
      ribbon.addColorStop(.18, `rgba(${colors[0]},.13)`);
      ribbon.addColorStop(.43, `rgba(${colors[0]},.22)`);
      ribbon.addColorStop(.64, `rgba(${colors[1]},.16)`);
      ribbon.addColorStop(.82, `rgba(${colors[2]},.08)`);
      ribbon.addColorStop(1, `rgba(${colors[2]},0)`);
      ctx.fillStyle = ribbon;
      for (let layer = 16; layer >= 1; layer -= 1) {
        ctx.globalAlpha = opacity * (1 - index * .27) * (1 - (layer - .5) / 16) ** 1.3;
        ctx.beginPath();
        for (const boundary of [layer, layer - 1]) {
          const spread = boundary / 16;
          const lower = 7 * spread;
          const rise = (76 + index * 13) * spread;
          ctx.moveTo(95 + offset, 255 + lean);
          ctx.bezierCurveTo(183 + offset, 248 + lower, 211, 156 - index * 12 + lower, 306, 190 + index * 6 + lower);
          ctx.bezierCurveTo(393, 217 + lower, 412, 278 - index * 26 + lower, 518 + index * 26, 231 - index * 12 + lower);
          ctx.bezierCurveTo(625, 181 + lower, 702, 208 + index * 9 + lower, 865 - offset * .5, 112 + lean);
          ctx.bezierCurveTo(702, 208 + index * 9 - rise * .32, 625, 181 - rise, 518 + index * 26, 231 - index * 12 - rise * .77);
          ctx.bezierCurveTo(412, 278 - index * 26 - rise * .33, 393, 217 - rise * 1.2, 306, 190 + index * 6 - rise * .64);
          ctx.bezierCurveTo(211, 156 - index * 12 - rise * .45, 183 + offset, 248 - rise * .18, 95 + offset, 255 + lean);
          ctx.closePath();
        }
        ctx.fill('evenodd');
      }
      ctx.restore();
    }
  } else if (feature.kind === 'moon-limb') {
    const age = (time - feature.startsAt) / 1000;
    const x = width * 1.08 + Math.sin(age * .02 + feature.seed) * 2 * height / 540;
    const y = height * (.34 + (feature.seed % 1) * .12), radius = height * .46;
    // Mostly out of frame: a dark opaque body hides the stars, while only the
    // thin grazing limb catches light. No transparent soap-bubble silhouette.
    ctx.globalAlpha = opacity;
    const limb = ctx.createRadialGradient(x, y, radius * .72, x, y, radius);
    limb.addColorStop(0, 'rgba(7,11,18,.97)');
    limb.addColorStop(.88, 'rgba(15,21,29,.97)');
    limb.addColorStop(.97, 'rgba(40,46,52,.95)');
    limb.addColorStop(.994, 'rgba(103,108,109,.48)');
    limb.addColorStop(1, 'rgba(103,108,109,0)');
    ctx.fillStyle = limb; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  } else {
    const x = width * (.68 + (feature.seed % 1) * .14);
    const y = height * (.19 + ((feature.seed * .29) % 1) * .12), radius = height * .016;
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = 'rgba(185,174,161,.24)'; ctx.lineWidth = height / 540 * .65;
    // Rear ring, shaded globe, then front ring gives a tiny but legible silhouette.
    ctx.beginPath(); ctx.ellipse(x, y, radius * 1.9, radius * .5, -.22, Math.PI, Math.PI * 2); ctx.stroke();
    const globe = ctx.createRadialGradient(x - radius * .4, y - radius * .4, 0, x, y, radius);
    globe.addColorStop(0, 'rgba(104,107,106,.88)'); globe.addColorStop(.58, 'rgba(45,51,58,.96)'); globe.addColorStop(1, 'rgba(9,14,23,.98)');
    ctx.fillStyle = globe; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(193,181,161,.31)';
    ctx.beginPath(); ctx.ellipse(x, y, radius * 1.9, radius * .5, -.22, 0, Math.PI); ctx.stroke();
  }
  ctx.restore();
}
function drawSkyMicroEvent(event: SkyMicroEvent, width: number, height: number, time: number) {
  const ctx = skyContext!;
  const progress = Math.max(0, Math.min(1, (time - event.startsAt) / (event.endsAt - event.startsAt)));
  const fade = Math.max(0, Math.min(1, progress / .18, (1 - progress) / .2));
  const x = width * (.2 + (event.seed % 1) * .55);
  const y = height * (.22 + ((event.seed * .31) % 1) * .42);
  // Geometry uses height-relative units, so points survive the 540p cap on a 4K TV.
  const unit = height / 540;
  const point = (px: number, py: number, radius: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, radius * unit, 0, Math.PI * 2); ctx.fill();
  };
  ctx.save(); ctx.globalAlpha = fade; ctx.lineCap = 'round';
  if (event.kind === 'firefly') {
    const px = x + Math.sin(progress * 2.6 + event.seed) * width * .025;
    const py = y + height * .16 - progress * height * .035 + Math.sin(progress * 4) * height * .009;
    // A local six-pixel gradient replaces any CSS shadow/filter.
    const glow = ctx.createRadialGradient(px, py, 0, px, py, 6 * unit);
    glow.addColorStop(0, 'rgba(214,228,177,.42)'); glow.addColorStop(1, 'rgba(214,228,177,0)');
    ctx.globalAlpha = fade * (.65 + Math.sin(progress * Math.PI * 3) * .25);
    ctx.fillStyle = glow; ctx.fillRect(px - 6 * unit, py - 6 * unit, 12 * unit, 12 * unit);
    point(px, py, 1.3, 'rgba(224,235,198,.65)');
  } else if (event.kind === 'meteor') {
    const px = x + progress * width * .19, py = y + progress * height * .13;
    const tailX = px - width * .065, tailY = py - height * .045;
    const trail = ctx.createLinearGradient(tailX, tailY, px, py);
    trail.addColorStop(0, 'rgba(180,206,220,0)'); trail.addColorStop(1, 'rgba(210,224,229,.52)');
    ctx.strokeStyle = trail; ctx.lineWidth = unit;
    ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(px, py); ctx.stroke();
    point(px, py, 1.2, 'rgba(223,232,234,.65)');
  } else if (event.kind === 'satellite') {
    point(x + (progress - .5) * width * .3, y - progress * height * .065, 1.25, 'rgba(210,223,227,.66)');
  } else if (event.kind === 'constellation') {
    const nodes = [[0, 0], [17, -10], [32, 3], [51, -16]];
    const trace = Math.min(1, progress / .65) * (nodes.length - 1);
    ctx.strokeStyle = 'rgba(180,202,211,.24)'; ctx.lineWidth = .8 * unit;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 1; i < nodes.length; i += 1) {
      const segment = Math.max(0, Math.min(1, trace - i + 1));
      const [ax, ay] = nodes[i - 1]!, [bx, by] = nodes[i]!;
      ctx.lineTo(x + (ax! + (bx! - ax!) * segment) * unit, y + (ay! + (by! - ay!) * segment) * unit);
      if (segment < 1) break;
    }
    ctx.stroke();
    nodes.forEach(([px, py], index) => {
      if (index <= Math.floor(trace)) point(x + px! * unit, y + py! * unit, 1.2, 'rgba(205,219,222,.52)');
    });
  } else if (event.kind === 'beacon') {
    // One slow swell, never a rapid flashing beacon.
    ctx.globalAlpha = fade * (.4 + .6 * Math.sin(progress * Math.PI) ** 2);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 4 * unit);
    glow.addColorStop(0, 'rgba(211,194,155,.24)'); glow.addColorStop(1, 'rgba(211,194,155,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 4 * unit, 0, Math.PI * 2); ctx.fill();
    point(x, y, 1.3, 'rgba(211,194,155,.6)');
  }
  ctx.restore();
}

function paintLiquidSky(time: number) {
  skyFrame = 0;
  if (!skyContext || document.hidden || skyReducedMotion.matches) return;
  if (time - lastSkyPaint < SKY_FRAME_INTERVAL_MS) { skyFrame = requestAnimationFrame(paintLiquidSky); return; }
  const elapsed = skyPreview ? 0 : Math.min(250, Math.max(0, time - skyLastTime));
  skyLastTime = time;
  lastSkyPaint = time;
  const width = skyCanvas.clientWidth || 1280, height = skyCanvas.clientHeight || 720;
  const dream = isSkyDream();
  const ratio = Math.min(1, SKY_MAX_RENDER_WIDTH / width, SKY_MAX_RENDER_HEIGHT / height);
  if (skyCanvas.width !== Math.round(width * ratio) || skyCanvas.height !== Math.round(height * ratio)) { skyCanvas.width = Math.round(width * ratio); skyCanvas.height = Math.round(height * ratio); }
  skyContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (!skyPreview && time > nextSkyVariation) retargetSky(time);
  // Let the sky respond a little sooner to its next target while retaining
  // an eased, continuous motion field—no jumps between asset compositions.
  const settle = 1 - Math.exp(-elapsed / 82_000);
  skyMotion.speed = smoothToward(skyMotion.speed, skyMotion.targetSpeed, settle);
  skyMotion.scale = smoothToward(skyMotion.scale, skyMotion.targetScale, settle);
  skyMotion.orbitX = smoothToward(skyMotion.orbitX, skyMotion.targetOrbitX, settle);
  skyMotion.orbitY = smoothToward(skyMotion.orbitY, skyMotion.targetOrbitY, settle);
  skyMotion.wobble = smoothToward(skyMotion.wobble, skyMotion.targetWobble, settle);
  skyMotion.phase += elapsed * skyMotion.speed;
  skyMotion.wobblePhase += elapsed * skyMotion.speed * skyMotion.wobble;
  skyImageBlend = Math.min(1, skyImageBlend + elapsed / 120_000);
  skyContext.fillStyle = '#080b14'; skyContext.fillRect(0, 0, width, height);
  // Opaque base plus a 0→1 incoming image makes the completed handoff exact:
  // outgoing overlay and next base are the same bitmap at the same transform.
  drawSkyImage(skyImages[skyBaseImage]!, width, height, 1, 'source-over');
  drawSkyImage(skyImages[skyOverlayImage]!, width, height, skyImageBlend, 'source-over');
  skyContext.globalCompositeOperation = 'source-over'; skyContext.globalAlpha = 1;
  skyMood = smoothToward(skyMood, targetSkyMood, 1 - Math.exp(-elapsed / 155_000));
  const activeMoods = dream ? dreamSkyMoods : skyMoods;
  const moodA = activeMoods[Math.min(activeMoods.length - 1, Math.floor(skyMood))]!, moodB = activeMoods[Math.min(activeMoods.length - 1, Math.ceil(skyMood))]!;
  const wash = skyContext.createRadialGradient(width * .42, height * .35, 0, width * .52, height * .5, width * .7);
  const blend = skyMood - Math.floor(skyMood);
  const mix = (a: string, b: string) => {
    const from = a.match(/[\d.]+/g)!.map(Number), to = b.match(/[\d.]+/g)!.map(Number);
    return `rgba(${from.map((value, index) => value + (to[index]! - value) * blend).join(',')})`;
  };
  wash.addColorStop(0, mix(moodA[0], moodB[0])); wash.addColorStop(.55, mix(moodA[1], moodB[1])); wash.addColorStop(1, 'rgba(2,5,12,.34)');
  skyContext.fillStyle = wash; skyContext.fillRect(0, 0, width, height);
  if (activeSkyFeature && time >= activeSkyFeature.endsAt) {
    if (activeSkyFeature.kind !== 'aurora') nextSkyFeatureAt = time + 180_000 + Math.random() * 240_000;
    lastSkyFeatureEndedAt = time;
    activeSkyFeature = null;
  }
  if (activeSkyMicroEvent && time >= activeSkyMicroEvent.endsAt) {
    activeSkyMicroEvent = null;
    nextSkyMicroEventAt = time + 240_000 + Math.random() * 300_000;
  }
  if (!dream || skyReducedMotion.matches) {
    activeSkyFeature = null;
    activeSkyMicroEvent = null;
  } else {
    if (!skyPreview && !activeSkyFeature) startSkyFeature(time);
    if (!skyPreview && !activeSkyMicroEvent && time >= nextSkyMicroEventAt) startSkyMicroEvent(time);
    if (import.meta.env.DEV && skyPreview) {
      // Freeze only staging time. Production events always expire normally.
      if (previewFeature) drawSkyFeature({ kind: previewFeature, startsAt: 0, endsAt: 40_000, seed: 13.45, palette: previewPalette }, width, height, 40_000 * previewProgress);
      if (previewMicro) drawSkyMicroEvent({ kind: previewMicro, startsAt: 0, endsAt: skyMicroDurations[previewMicro], seed: 12.45 }, width, height, skyMicroDurations[previewMicro] * previewProgress);
    } else {
      if (activeSkyFeature) drawSkyFeature(activeSkyFeature, width, height, time);
      if (activeSkyMicroEvent) drawSkyMicroEvent(activeSkyMicroEvent, width, height, time);
    }
  }
  skyFrame = requestAnimationFrame(paintLiquidSky);
}
function startSkyRendering() {
  if (!document.hidden && !skyReducedMotion.matches && skyFrame === 0) {
    resetSkyEvents(performance.now());
    lastSkyPaint = 0;
    skyLastTime = performance.now();
    skyFrame = requestAnimationFrame(paintLiquidSky);
  }
}
function stopSkyRendering() {
  if (skyFrame) window.cancelAnimationFrame(skyFrame);
  skyFrame = 0;
  resetSkyEvents(performance.now());
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopSkyRendering();
  else startSkyRendering();
});
window.addEventListener('pagehide', stopSkyRendering);
window.addEventListener('pageshow', startSkyRendering);
skyReducedMotion.addEventListener('change', () => {
  if (skyReducedMotion.matches) stopSkyRendering();
  else startSkyRendering();
});
enableSpotifyPreview();
startSkyRendering();

armIdleDreamTimer();
