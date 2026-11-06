import { makeCloudMasks, erodedAlpha, cloudFlowOffset, advectedParcel } from './background-cloud-pass';
import { cloudClearing, mixSkyColor, isGalaxyPhase, GALAXY_PHASE_MS, liquidCloudDuration, crossfadeSplit, cloudscapeOrdinal, TRANSITION_TEST_PHASE_MS, TRANSITION_TEST_SPLIT, type SkyColor } from './sky-composition';
import { veilAlphas, veilWeight } from './transition-veil';
import { GALAXY_INDEX, drawStaticBackgroundTransition, drawSpatialBackgroundTransition, imageReady, prepareStaticBackground } from './transition-pass';
import { CloudTexture, type CloudFlash } from './cloud-texture';
import { HybridSky } from './hybrid-sky';
import { useDreamMode } from './launch-mode';
import { makeBackgroundLightningMask, thunderWaitMs, backgroundThunderAnchor, initialWeather, chooseWeather, advanceWeather, milkyPhase, canAddSkyEvent, lightningPulse, thunderExposure, thunderPosition, thunderDuration, weatherForMode } from './sky-weather';
import './style.css';
import './ambient.css';
import { advanceWind, createWindFields, retargetWinds, skyEventWeights, type SkyMicroEventKind } from './dream-sky';

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
// A test URL must never force the native Home activity into the screensaver.
// Standalone browser previews and the actual DreamService can still request it.
const dreamMode = useDreamMode(new URLSearchParams(window.location.search).get('mode'), window.LunaHost?.isDreamHost?.());

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
          <linearGradient id="spotify-glass-rim" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="white" stop-opacity=".40"/><stop offset=".23" stop-color="white" stop-opacity=".13"/><stop offset=".5" stop-color="white" stop-opacity=".30"/><stop offset=".75" stop-color="white" stop-opacity=".11"/><stop offset="1" stop-color="white" stop-opacity=".30"/></linearGradient>
          <filter id="spotify-rim-soft" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="2.5"/></filter>
          <path id="spotify-glass-shape" d="M 200 10 C 95 10 10 95 10 200 C 10 305 95 390 200 390 C 278 390 322 344 368 302 C 438 240 503 240 576 274 C 629 299 652 325 720 325 L 888 325 C 958 325 990 278 990 200 C 990 122 958 75 888 75 L 720 75 C 652 75 629 101 576 126 C 503 160 438 160 368 98 C 322 56 278 10 200 10 Z"/>
        </defs>
        <use href="#spotify-glass-shape" fill="none" stroke="url(#spotify-glass-rim)" stroke-width="9" opacity=".055"/>
        <use href="#spotify-glass-shape" fill="none" stroke="url(#spotify-glass-rim)" stroke-width="3" opacity=".75"/>
        <g fill="none" stroke="white" stroke-linecap="round" pointer-events="none">
          <path d="M 33 126 C 63 51 132 17 200 17 M 728 82 L 880 82 C 927 82 950 100 965 133 M 693 315 C 741 323 821 318 887 318 C 940 318 967 284 978 248" stroke-width="7" opacity=".045" filter="url(#spotify-rim-soft)"/>
          <path d="M 53 89 C 86 44 137 19 181 17 M 805 79 L 875 79 M 744 321 L 883 321" stroke-width="1.5" opacity=".11"/>
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
let spotifyArtIsPlaying = false;

const SPOTIFY_ART_ROTATION_PERIOD_MS = 28_000;
const spotifyArtworkAnimation = spotifyArt.animate([
  { transform: 'scale(1.02) rotate(0deg)' },
  { transform: 'scale(1.02) rotate(360deg)' },
], { duration: SPOTIFY_ART_ROTATION_PERIOD_MS, iterations: Infinity, easing: 'linear' });
spotifyArtworkAnimation.pause();

function setSpotifyArtPlaying(playing: boolean) {
  if (spotifyArtIsPlaying === playing) return;
  spotifyArtIsPlaying = playing;
  if (playing) spotifyArtworkAnimation.play(); else spotifyArtworkAnimation.pause();
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
  if (!internalDreamActive && state.zone === 'apps') appButtons[state.appIndex]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  homeAppsButtons.forEach((button, index) => button.classList.toggle('is-selected', homeAppIds.includes(allApps[index].id)));
  systemTrigger.classList.toggle('is-active', state.zone === 'system-trigger');
  systemTrigger.tabIndex = 0;
  if (showingAllApps) allAppsButtons[state.allAppsIndex]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  if (showingHomeApps) homeAppsButtons[state.homeAppsIndex]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  // Dream hides the Home rail; measuring its bounds at the same moment can
  // force a costly layout during the animation handoff on the projector.
  if (!internalDreamActive) updateGlow();
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
  // Preserve the last sky pixels and any visible event through the handoff.
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
  // Media/system/unknown keys should not dismiss the idle screensaver.
  // Real navigation and Back remain able to wake it as before.
  if (internalDreamActive && !keyboardInput.recognizes(event.key)) return;
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
  armIdleDreamTimer();
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
// present exactly every other refresh on a 60 Hz display for a stable 30 FPS.
let skyCanvas = document.querySelector<HTMLCanvasElement>('.ambient-canvas')!;
skyCanvas.style.visibility = 'hidden';
let backCanvas = skyCanvas.cloneNode(false) as HTMLCanvasElement;
let skyContext = backCanvas.getContext('2d', { alpha: false });
const presentationContext = skyCanvas.getContext('2d', { alpha: false })!;
// One persistent compositor surface. Render into a detached buffer and commit
// with one copy; replacing DOM canvases at 30 Hz churned WebView surfaces.
skyCanvas.width = 960; skyCanvas.height = 540;
const skyReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hybridParams = new URLSearchParams(window.location.search);
// Historical full-frame plates are kept for local development only; shipped
// builds use the still from this renderer as their failure/reduced-motion view.
const legacySkyEnabled = import.meta.env.DEV && hybridParams.has('legacySky');
let hybridSkyPending = !legacySkyEnabled && !skyReducedMotion.matches;
const isSkyDream = () => dreamMode || internalDreamActive;
// The fixed star field and slowly revealed photographic galactic band sit
// behind the independently evolving cloud banks on the same canvas.
// Keep the cloud raster at the budgeted size from the first frame. Switching
// resolution and noise octaves during playback changes the visible texture in
// one frame and briefly renders the expensive layer twice.
// Keep the procedural mask deliberately cheap on Android/WebView/projector
// hardware. The photographic detail layer supplies the perceived sharpness
// after this mask is upscaled.
const cloudTexture = new CloudTexture(160, 90);
let cloudCanvas: HTMLCanvasElement | null = null;
let cloudCanvasContext: CanvasRenderingContext2D | null = null;
let cloudImageData: ImageData | null = null;
// Texture time, warped by the same weather/speed factor as the wind so shape
// development keeps pace with drift; the boundary harness reads this value.
let cloudSeconds = 0;
function ensureCloudSurface() {
  if (cloudCanvas && cloudImageData && cloudCanvas.width === cloudTexture.width) return;
  cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = cloudTexture.width;
  cloudCanvas.height = cloudTexture.height;
  cloudCanvasContext = cloudCanvas.getContext('2d')!;
  cloudImageData = cloudCanvasContext.createImageData(cloudTexture.width, cloudTexture.height);
}
const nightSkyImage = new Image();
let nightSkyBand: HTMLCanvasElement | null = null;
let milkyReveal = 0;
let dreamSkyElapsed = 0;
function buildMilkyBand(image: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = 540;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  // Gradient axis perpendicular to the top-left -> bottom-right galactic band;
  // iso-lines therefore run exactly along the band.
  const band = context.createLinearGradient(-168, 1422, 1128, -882);
  band.addColorStop(0, 'rgba(0,0,0,0)');
  band.addColorStop(.30, 'rgba(0,0,0,.14)');
  band.addColorStop(.43, 'rgba(0,0,0,1)');
  band.addColorStop(.57, 'rgba(0,0,0,1)');
  band.addColorStop(.70, 'rgba(0,0,0,.14)');
  band.addColorStop(1, 'rgba(0,0,0,0)');
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = band;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'source-over';
  return canvas;
}
nightSkyImage.decoding = 'async';
nightSkyImage.onload = () => { nightSkyBand = buildMilkyBand(nightSkyImage); };
if (legacySkyEnabled) nightSkyImage.src = '/assets/backgrounds/luna-milky-way-v1.png';
// 30 FPS divides a 60 Hz display evenly, avoiding the alternating frame
// intervals that made motion look like occasional jumps on the projector.
let skyFrameIntervalMs = 1000 / 30;
const SKY_MAX_RENDER_WIDTH = 960;
const SKY_MAX_RENDER_HEIGHT = 540;
const SKY_RETARGET_HOME_MS = 240_000;
const SKY_RETARGET_DREAM_MS = 150_000;
// Independent cloud fields share a prevailing wind, never a camera transform.
const skyMotion = createWindFields();
// A fresh piece of the continuous noise field on every launch; no looping clip.
const skyOriginX = Math.random() * 32, skyOriginY = Math.random() * 32;
skyMotion.forEach(field => { field.x += skyOriginX; field.y += skyOriginY; });
const skyWeather = { ...initialWeather, ...chooseWeather(Math.random) };
let targetWeather = chooseWeather(Math.random);
let skyDreamBlend = isSkyDream() ? 1 : 0;
let renderedWeather = weatherForMode(skyWeather, skyDreamBlend);
const skyMoods = [
  ['rgba(82,44,111,.08)', 'rgba(20,38,61,.04)'],
  ['rgba(55,71,126,.08)', 'rgba(26,33,72,.05)'],
  ['rgba(47,91,96,.07)', 'rgba(31,38,70,.05)'],
  ['rgba(92, 50, 126, .07)', 'rgba(23, 42, 74, .05)'],
  ['rgba(104,67,104,.075)', 'rgba(25,45,70,.045)'],
  ['rgba(57,88,105,.07)', 'rgba(33,33,66,.05)'],
] as const;
// Home keeps a subdued, natural cool register. Dream mode can explore a
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
let previewClearSky = false;
let skyWasDream = isSkyDream();
let skyEventVisibility = 1;
// User feedback 2026-11-04: drift much faster. The retarget band in dream-sky
// is also wider now, so this multiplier compounds into clear on-screen speed.
// Background-mask motion must read from projector distance: the wind remains
// bounded and horizontal, while the mask's faster local phase gives the fixed
// cloud plate a clear but still gradual downwind evolution.
const SKY_CLOUD_SPEED = 22;
const FOREGROUND_CLOUDS_ENABLED = false;
let nextSkyVariation = performance.now() + 150_000;
let skyFrame = 0;
let hybridSkyActive = false;
let lastSkyPaint = 0;
let skyLastTime = performance.now();
type SkyMicroEvent = { kind: SkyMicroEventKind; startsAt: number; endsAt: number; seed: number; anchors?: { x: number; y: number; windX: number; windY: number }[] };
const skyMicroEventCatalogue = skyEventWeights.map(([kind]) => kind);
let activeSkyMicroEvents: SkyMicroEvent[] = [];
let nextSkyMicroEventAt = 0;
const skyMicroDurations: Record<SkyMicroEventKind, number> = {
  firefly: 11_000, meteor: 3_700, satellite: 9_000, constellation: 12_000, beacon: 10_000, thunder: 3_200, 'meteor-shower': 9_000, 'binary-star': 14_000, 'dust-drift': 16_000,
  'planet-glint': 10_000, 'star-cluster': 13_000, 'firefly-pair': 12_000, comet: 21_000, flare: 5_000, 'star-dance': 16_000,
};
// DEV-only staging freezes a single micro-event; large features are unavailable.
const thunderTest = new URLSearchParams(window.location.search).has('thunderTest');
// Explicit test staging for background transitions: a repeatable 10 s phase
// with a ~4.5 s crossfade. Normal mode keeps its liquid multi-minute schedule.
const transitionTest = Boolean((import.meta.env.DEV || window.LunaHost?.rendererQA?.()) && new URLSearchParams(window.location.search).has('transitionTest'));
// Explicit DEV staging only: advancing the background timeline does not alter
// render cadence, camera geometry, or the production schedule. At 24x a cloud
// phase reaches its transition window in roughly 10–20 seconds for vision QA.
const skyTimeScaleValue = Number(new URLSearchParams(window.location.search).get('skyTimeScale') ?? '1');
const skyTimeScale = import.meta.env.DEV && Number.isFinite(skyTimeScaleValue)
  ? Math.max(1, Math.min(60, skyTimeScaleValue)) : 1;
const skyPreviewParams = import.meta.env.DEV && dreamMode ? new URLSearchParams(window.location.search) : null;
const skyPreviewNames = skyPreviewParams?.get('skyPreview')?.replace(/ /g, '+').split('+') ?? [];
const previewMicro = skyPreviewNames.find(name => skyMicroEventCatalogue.includes(name as SkyMicroEventKind)) as SkyMicroEventKind | undefined;
const skyPreview = Boolean(previewMicro || skyPreviewNames.includes('none'));
const previewProgressValue = Number(skyPreviewParams?.get('skyProgress') ?? .55);
const previewProgress = Number.isFinite(previewProgressValue) ? Math.max(0, Math.min(1, previewProgressValue)) : .55;
if (skyPreview) {
  Object.assign(skyWeather, initialWeather);
  targetWeather = { ...initialWeather };
  // Freeze the wind so an event screenshot is repeatable.
  skyMotion.forEach((field, index) => { field.x = .35 - index * .21; field.y = 0; });
  const background = Number(skyPreviewParams?.get('skyBackground') ?? 1);
  previewClearSky = background === 1;
}
// DEV-only Milky Way staging: thin cloud sheet, band and clusters surfacing.
const skyMilkyPreview = Boolean(import.meta.env.DEV && dreamMode && new URLSearchParams(window.location.search).get('skyMilky'));
if (skyMilkyPreview) {
  Object.assign(skyWeather, initialWeather, { amount: .2, thickness: .8, storm: 0, milkyWay: .85, stars: 1 });
  targetWeather = { ...skyWeather, amount: .16, milkyWay: .85, stars: 1 };
  milkyReveal = .85;
}

function resetSkyEvents(time: number) {
  activeSkyMicroEvents = [];
  nextSkyMicroEventAt = time + (thunderTest ? 4_000 : thunderWaitMs(Math.random(), true));
}

function smoothToward(current: number, target: number, amount: number) {
  return current + (target - current) * amount;
}
function retargetSky(time: number) {
  const dream = isSkyDream();
  retargetWinds(skyMotion, Math.random(), Math.random());
  targetWeather = chooseWeather(Math.random);
  const moods = dream ? dreamSkyMoods : skyMoods;
  targetSkyMood = Math.floor(Math.random() * moods.length);
  nextSkyVariation = time + (dream ? SKY_RETARGET_DREAM_MS : SKY_RETARGET_HOME_MS) + Math.random() * (dream ? 90_000 : 120_000);
}

function startSkyMicroEvent(time: number) {
  const dream = isSkyDream();
  // 2026-11-04: every micro-event except thunder is disabled. Thunder is the
  // only kind on Dream and on Home; its length varies per event, which varies
  // the real-time velocity of the pulse train and the scheduler's cadence.
  const kind = 'thunder';
  nextSkyMicroEventAt = time + (thunderTest ? 4_000 : thunderWaitMs(Math.random()));
  if (!canAddSkyEvent(activeSkyMicroEvents.map(event => event.kind), kind)) return;

  const seed = thunderTest ? 12.45 : Math.random() * 100;
  const anchors = kind === 'thunder' ? makeThunderAnchors(seed) : undefined;
  // Thunder must reliably occur whenever Dream shows dense enough banks: if the
  // mask has no solid cluster yet, retry shortly instead of silently waiting a
  // full scheduler cycle.
  if (kind === 'thunder' && !anchors?.length) {
    nextSkyMicroEventAt = time + 1_000;
    return;
  }
  const duration = kind === 'thunder' ? thunderDuration(seed) : skyMicroDurations[kind];
  activeSkyMicroEvents.push({ kind, startsAt: time, endsAt: time + duration, seed, anchors });
  // Occasionally allow a second, distinct small event; hard cap remains two.
  if (dream && kind !== 'thunder' && activeSkyMicroEvents.length === 1 && Math.random() < .18) nextSkyMicroEventAt = time + 1_200;
}
function makeThunderAnchors(seed: number) {
  const mask = backgroundThunderMasks[skyBackgroundIndex];
  if (!mask || !backgroundThunderVisible) return [];
  const center = backgroundThunderAnchor(mask, seed, 1);
  return center ? [{ x: center.x, y: center.y, windX: 0, windY: 0 }] : [];
}
const previewThunderEvent: SkyMicroEvent = { kind: 'thunder', startsAt: 0, endsAt: 3_200, seed: 12.45 };
function cloudFlashes(time: number): CloudFlash[] {
  const events = skyPreview && previewMicro === 'thunder'
    ? [previewThunderEvent] : activeSkyMicroEvents;
  const flashes: CloudFlash[] = [];
  for (const event of events) {
    if (event.kind !== 'thunder') continue;
    const progress = skyPreview ? previewProgress : (time - event.startsAt) / (event.endsAt - event.startsAt);
    // Cache one cluster once, including previews/QA events without anchors.
    if (!event.anchors?.length) {
      const anchors = makeThunderAnchors(event.seed);
      if (!anchors.length) continue;
      event.anchors = anchors;
    }
    // Brighter localized discharge colors: pulses must read through the cloud
    // mask without ever leaving it (the mask stays the only light source).
    const colors = [[255,220,170], [225,210,255], [200,230,255]] as const;
    const color = colors[Math.floor(event.seed) % colors.length]!;
    for (let i = 0; i < event.anchors.length; i++) {
      const position = event.anchors[i]!;
      flashes.push({ ...position, color, radius: .2 + (event.seed % 1) * .06,
        strength: thunderExposure(lightningPulse(progress, event.seed, i), skyDreamBlend) });
    }
  }
  return flashes;
}

// Real night sky: one reference photograph under a completely static camera.
// A band-masked copy surfaces as milkyReveal rises, so the Milky Way arrives
// over minutes. Clouds are always drawn later, in front of every star.
function drawCover(context: CanvasRenderingContext2D, image: CanvasImageSource, imageWidth: number, imageHeight: number,
  width: number, height: number) {
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale, drawHeight = imageHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}
function drawNightSky(width: number, height: number) {
  const ctx = skyContext!;
  ctx.fillStyle = '#050912';
  ctx.fillRect(0, 0, width, height);
  if (!nightSkyImage.naturalWidth) return;
  // Exact cover fit, no zoom, no drift, no wobble: the sky photo is locked.
  if (nightSkyBand) {
    ctx.globalAlpha = .86 * Math.max(0, Math.min(1, milkyReveal)) * (.45 + .55 * skyDreamBlend);
    drawCover(ctx, nightSkyBand, nightSkyBand.width, nightSkyBand.height, width, height);
  }
  ctx.globalAlpha = 1;
}
// A sparse layer of procedural twinkles rides on top of the photographed stars.
// The photo supplies density and the galactic band; these points supply life.
const skyStars = Array.from({ length: 120 }, (_, index) => {
  const rough = ((Math.sin(index * 127.1 + 3) * 43758.5453) % 1 + 1) % 1;
  const roughY = ((Math.sin(index * 269.5 + 7) * 18341.231) % 1 + 1) % 1;
  return { x: rough, y: roughY, radius: .5 + (index % 4) * .16 };
});
function drawSkyStars(width: number, height: number, time: number) {
  const ctx = skyContext!;
  const strength = .09 + .20 * Math.max(0, Math.min(1, renderedWeather.stars));
  ctx.save();
  for (let i = 0; i < skyStars.length; i++) {
    const star = skyStars[i]!;
    const x = star.x * width;
    const edge = Math.min(1, x / (width * .03), (width - x) / (width * .03));
    const twinkle = .55 + .45 * Math.sin(time * .0009 * (1 + (i % 7) * .13) + i * 1.7);
    ctx.globalAlpha = Math.max(0, Math.min(.6, strength * twinkle * edge));
    ctx.fillStyle = i % 13 === 0 ? '#cbbd9f' : '#aebccd';
    ctx.beginPath();
    ctx.arc(x, star.y * height, star.radius * height / 540, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
// Sky phenomena draw behind the cloud banks: the photographic stars, the
// Milky Way band and every point event occlude naturally wherever a bank
// actually covers them, exactly like a real sky layering.
function drawSkyMicroEvents(width: number, height: number, time: number) {
  if (skyReducedMotion.matches) return;
  if (import.meta.env.DEV && skyPreview) {
    if (previewMicro) drawSkyMicroEvent({ kind: previewMicro, startsAt: 0, endsAt: skyMicroDurations[previewMicro], seed: 12.45 }, width, height, skyMicroDurations[previewMicro] * previewProgress);
  } else {
    activeSkyMicroEvents.forEach(event => drawSkyMicroEvent(event, width, height, time));
  }
}
// Photographic detail sampled from the supplied cloudscapes, confined to the
// live cloud mask. Geometry and movement remain independent per cloud; the
// high-resolution layer adds billows rather than replacing the moving mask.
const cloudDetailImages = ['cloud-violet', 'cloud-storm', 'cloud-drift', 'cloud-amber'].map(name => {
  const image = new Image(); image.decoding = 'async'; image.src = `/assets/clouds/${name}.png`; return image;
});
let cloudDetailCanvas: HTMLCanvasElement | null = null;
function drawCloudDetail(width: number, height: number, opacity = .9, tint?: SkyColor) {
  if (!cloudCanvas) return;
  if (!cloudDetailCanvas) { cloudDetailCanvas = document.createElement('canvas'); cloudDetailCanvas.width = 960; cloudDetailCanvas.height = 540; }
  const detail = cloudDetailCanvas.getContext('2d')!;
  const w = cloudDetailCanvas.width, h = cloudDetailCanvas.height;
  detail.clearRect(0, 0, w, h);
  detail.globalCompositeOperation = 'source-over';
  for (const bank of cloudTexture.geometry) {
    const image = cloudDetailImages[bank.id % cloudDetailImages.length]!;
    if (!image.complete || !image.naturalWidth) continue;
    const dw = bank.width * 2 * w, dh = bank.height * 2 * h;
    // Subtle independent breathing complements the evolving procedural mask.
    const stretch = 1 + .025 * Math.sin(cloudSeconds * .035 + bank.id * 1.7);
    detail.globalAlpha = .88;
    detail.drawImage(image, bank.cx * w - dw * stretch / 2, bank.cy * h - dh / 2, dw * stretch, dh);
  }
  // Tint the photographic detail towards the current image without a
  // readback or another canvas; source-atop preserves the existing alpha.
  if (tint) {
    detail.globalCompositeOperation = 'source-atop'; detail.globalAlpha = .72;
    detail.fillStyle = `rgb(${tint.map(v => Math.round(v)).join(',')})`;
    detail.fillRect(0, 0, w, h);
  }
  detail.globalAlpha = 1;
  detail.globalCompositeOperation = 'destination-in';
  detail.drawImage(cloudCanvas, 0, 0, w, h);
  detail.globalCompositeOperation = 'source-over';
  skyContext!.save();
  skyContext!.globalAlpha = opacity;
  skyContext!.drawImage(cloudDetailCanvas, 0, 0, width, height);
  skyContext!.restore();
}
// The supplied photographs are the background itself. A complete cycle uses
// Equal eight-minute phases, the last four minutes of each blending into the next.
// Fixed cover geometry means a transition never moves the camera.
const skyBackgroundImages = ['luna-cloudscape-v1.png', 'luna-cloudscape-v2.png', 'luna-cloudscape-v3.png', 'luna-cloudscape-v4.png', 'luna-cloudscape-v5.png', 'luna-cloudscape-v6.png', 'luna-cloudscape-v7-violet.png', 'luna-cloudscape-v8-amber.png', 'luna-cloudscape-v9-green.png', 'luna-milky-way-v1.png'].map(name => {
  const image = new Image(); image.decoding = 'async'; if (legacySkyEnabled) image.src = `/assets/backgrounds/${name}`; return image;
});
type BackgroundCloudPass = {
  source: Uint8ClampedArray; luma: Float32Array; output: ImageData; mask: Uint8Array;
  highlight: Uint8Array; highlightCanvas: HTMLCanvasElement; highlightImage: ImageData;
  indices: number[]; width: number; height: number;
  canvas: HTMLCanvasElement; alphaCanvas: HTMLCanvasElement; alphaImage: ImageData;
};
// Verified cloudscapes that may rotate as the photographic base. v2/v3/v4/v6
// stay on disk but out of the active rotation until they are separately
// verified; v1, v5 and the three manifest-approved v7-v9 carry the loop.
const ACTIVE_CLOUDSCAPES: readonly number[] = [0, 4, 6, 7, 8];
const backgroundCloudPasses: Array<BackgroundCloudPass | null> = Array(skyBackgroundImages.length).fill(null);
const backgroundThunderCanvases: Array<HTMLCanvasElement | null> = Array(skyBackgroundImages.length).fill(null);
const skyBackgroundMasks: Array<HTMLCanvasElement | null> = Array(skyBackgroundImages.length).fill(null);
const backgroundThunderMasks: Array<{ width: number; height: number; alpha: Uint8Array } | null> = Array(skyBackgroundImages.length).fill(null);
let backgroundThunderVisible = false;
const skyColorGrids: Array<SkyColor[] | null> = Array(skyBackgroundImages.length).fill(null);
const skyBackgroundColors: SkyColor[] = [[42, 41, 55], [36, 42, 51], [38, 43, 53], [42, 39, 48], [37, 45, 40], [37, 47, 40], [39, 40, 55], [48, 40, 35], [34, 48, 44], [34, 37, 48]];
skyBackgroundImages.forEach((image, index) => {
  image.addEventListener('load', () => {
    if (ACTIVE_CLOUDSCAPES.includes(index) || index === GALAXY_INDEX) prepareStaticBackground(image);
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 54;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    drawCover(ctx, image, image.naturalWidth, image.naturalHeight, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let red = 0, green = 0, blue = 0, weight = 0;
    const masks = makeCloudMasks(canvas.width, canvas.height, pixels.data);
    const lightningMask = { width: canvas.width, height: canvas.height, alpha: masks.highlight };
    if (ACTIVE_CLOUDSCAPES.includes(index)) {
      const source = new Uint8ClampedArray(pixels.data);
      const luma = new Float32Array(canvas.width * canvas.height);
      for (let i = 0; i < luma.length; i++) luma[i] = .2126 * source[i * 4]! + .7152 * source[i * 4 + 1]! + .0722 * source[i * 4 + 2]!;
      const layer = document.createElement('canvas'); layer.width = canvas.width; layer.height = canvas.height;
      const alphaCanvas = document.createElement('canvas'); alphaCanvas.width = canvas.width; alphaCanvas.height = canvas.height;
      const highlightCanvas = document.createElement('canvas'); highlightCanvas.width = canvas.width; highlightCanvas.height = canvas.height;
      const output = layer.getContext('2d')!.createImageData(canvas.width, canvas.height);
      const alphaImage = alphaCanvas.getContext('2d')!.createImageData(canvas.width, canvas.height);
      const highlightImage = highlightCanvas.getContext('2d')!.createImageData(canvas.width, canvas.height);
      const indices: number[] = [];
      for (let i = 0; i < masks.cloud.length; i++) if (masks.cloud[i]) indices.push(i);
      backgroundCloudPasses[index] = { source, luma, output, mask: masks.cloud, highlight: masks.highlight, highlightCanvas, highlightImage,
        indices, width: canvas.width, height: canvas.height, canvas: layer, alphaCanvas, alphaImage };
      // The discharge mask must be the plate's own displaced highlight, so the
      // lightning canvas for active cloudscapes is repainted every frame.
      backgroundThunderCanvases[index] = highlightCanvas;
    }
    if (index !== GALAXY_INDEX) {
      backgroundThunderMasks[index] = lightningMask;
      // Static fallback highlight for non-active plates; active cloudscapes
      // registered a dynamic displaced-highlight canvas above.
      if (!backgroundCloudPasses[index]) {
        const lightning = document.createElement('canvas'); lightning.width = canvas.width; lightning.height = canvas.height;
        const lightningCtx = lightning.getContext('2d')!;
        const lightningPixels = lightningCtx.createImageData(canvas.width, canvas.height);
        for (let i = 0; i < lightningMask.alpha.length; i++) {
          lightningPixels.data[i * 4] = lightningPixels.data[i * 4 + 1] = lightningPixels.data[i * 4 + 2] = 255;
          lightningPixels.data[i * 4 + 3] = lightningMask.alpha[i]!;
        }
        lightningCtx.putImageData(lightningPixels, 0, 0); backgroundThunderCanvases[index] = lightning;
      }
    }
    for (let i = 0; i < pixels.data.length; i += 4) {
      const luma = .2126 * pixels.data[i]! + .7152 * pixels.data[i + 1]! + .0722 * pixels.data[i + 2]!;
      if (luma > 24 && luma < 110) { red += pixels.data[i]!; green += pixels.data[i + 1]!; blue += pixels.data[i + 2]!; weight++; }
    }
    if (weight) skyBackgroundColors[index] = [red / weight, green / weight, blue / weight];
    // A tiny, cached 6×4 colour map keeps the per-frame work to one lookup per
    // cloud; no canvas readback is performed during animation.
    const sums = Array.from({ length: 24 }, () => [0, 0, 0, 0]);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const luma = .2126 * pixels.data[i]! + .7152 * pixels.data[i + 1]! + .0722 * pixels.data[i + 2]!;
      if (luma < 20 || luma > 110) continue;
      const bin = sums[Math.min(3, Math.floor(y * 4 / canvas.height)) * 6 + Math.min(5, Math.floor(x * 6 / canvas.width))]!;
      bin[0]! += pixels.data[i]!; bin[1]! += pixels.data[i + 1]!; bin[2]! += pixels.data[i + 2]!; bin[3]!++;
    }
    skyColorGrids[index] = sums.map(bin => bin[3]! ? [bin[0]! / bin[3]!, bin[1]! / bin[3]!, bin[2]! / bin[3]!] as SkyColor : skyBackgroundColors[index]!);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const luma = .2126 * pixels.data[i]! + .7152 * pixels.data[i + 1]! + .0722 * pixels.data[i + 2]!;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = index === GALAXY_INDEX ? 0 : Math.max(0, Math.min(255, (luma - 12) * 7));
    }
    ctx.putImageData(pixels, 0, 0); skyBackgroundMasks[index] = canvas;

  });
});
// Quality-first transition rotation: keep one proven cloudscape and Milky Way.
// Other assets remain available on disk but are disabled until independently verified.
// Variable rotation: one shuffled bag per eight-phase cycle. The two galaxy
// slots (3 and 7) stay fixed, while the six cloud slots draw distinct
// cloudscapes, so the loop no longer repeats one photo and one fixed period.
const cloudscapeBags: number[][] = [];
function cloudscapeBagFor(cycle: number) {
  while (cloudscapeBags.length <= cycle) {
    const bag = [...ACTIVE_CLOUDSCAPES];
    if (!transitionTest) {
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      // Keep a shuffled starting point, then prefer compatible palette
      // neighbours. Random weighting varies sets without hard hue clashes.
      for (let i = 1; i < bag.length; i++) {
        const previous = skyBackgroundColors[bag[i - 1]!]!;
        let best = i, bestScore = Infinity;
        for (let j = i; j < bag.length; j++) {
          const color = skyBackgroundColors[bag[j]!]!;
          const score = color.reduce((sum, value, ch) => sum + (value - previous[ch]!) ** 2, 0) * (.8 + Math.random() * .5);
          if (score < bestScore) { best = j; bestScore = score; }
        }
        [bag[i], bag[best]] = [bag[best]!, bag[i]!];
      }
    }
    cloudscapeBags.push(bag);
  }
  return cloudscapeBags[cycle]!;
}
function backgroundAt(slot: number) {
  const cycle = Math.floor(slot / 8), within = ((slot % 8) + 8) % 8;
  const bag = cloudscapeBagFor(cycle);
  return isGalaxyPhase(within) ? GALAXY_INDEX : bag[cloudscapeOrdinal(within) % bag.length]!;
}
function backgroundColorAt(index: number, x: number, y: number): SkyColor {
  const grid = skyColorGrids[index];
  if (!grid) return skyBackgroundColors[index]!;
  const px = Math.max(0, Math.min(5, x * 6 - .5)), py = Math.max(0, Math.min(3, y * 4 - .5));
  const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(5, x0 + 1), y1 = Math.min(3, y0 + 1);
  const upper = mixSkyColor(grid[y0 * 6 + x0]!, grid[y0 * 6 + x1]!, px - x0);
  const lower = mixSkyColor(grid[y1 * 6 + x0]!, grid[y1 * 6 + x1]!, px - x0);
  return mixSkyColor(upper, lower, py - y0);
}
let skyBackgroundElapsed = 0, skyBackgroundIndex = 0;
// End-of-phase times for a liquid schedule: each slot records its own length so
// no slot boundary can be derived from a fixed period; elapsed only grows, so
// the schedule is extended lazily ahead of the play head.
const skyPhaseEnds: number[] = [];
// Each slot also draws its own randomized crossfade fraction, so transition
// pace varies phase to phase and no fixed half-window beat recurses.
const skyPhaseSplits: number[] = [];
let lastSkyCloudDuration = 8 * 60_000;
function extendSkySchedule() {
  const slot = skyPhaseEnds.length, within = skyPhaseEnds.length % 8;
  // Liquid window: cloud phases drift each 4.5–7.5 min; galaxy phases stay at
  // 8 min because they carry the fixed Milky Way time share. Test staging uses
  // a short repeatable cycle so one full transition is visible in seconds.
  const duration = transitionTest ? TRANSITION_TEST_PHASE_MS
    : isGalaxyPhase(within) ? GALAXY_PHASE_MS
    : liquidCloudDuration(lastSkyCloudDuration, Math.random);
  lastSkyCloudDuration = duration;
  skyPhaseEnds.push((slot ? skyPhaseEnds[slot - 1]! : 0) + duration);
  skyPhaseSplits.push(transitionTest ? TRANSITION_TEST_SPLIT : crossfadeSplit(Math.random));
}
function skySlotAt(elapsed: number) {
  while (!skyPhaseEnds.length || skyPhaseEnds[skyPhaseEnds.length - 1]! <= elapsed) extendSkySchedule();
  let slot = skyPhaseEnds.length - 1;
  while (slot > 0 && skyPhaseEnds[slot - 1]! > elapsed) slot--;
  const start = slot ? skyPhaseEnds[slot - 1]! : 0;
  return { slot, within: elapsed - start, duration: skyPhaseEnds[slot]! - start };
}

// Paint only conservative, fixed-position pixels from the active cloudscape.
// Their source content flows locally with the shared wind while the alpha
// phases/erodes; the photographic sky and stars remain in the static plate.
const cloudFlowScratch = { x: 0, y: 0, shade: 1 };
function drawBackgroundCloudPhase(width: number, height: number, index: number, weight: number, clear: number) {
  const pass = backgroundCloudPasses[index];
  if (!pass || weight <= 0) return;
  const wind = skyMotion[0]!, w = pass.width, h = pass.height;
  const data = pass.output.data, alpha = pass.alphaImage.data, highlight = pass.highlightImage.data;
  const parcelA = advectedParcel(wind.x), parcelB = advectedParcel(wind.x, true);
  const direction = wind.vx >= 0 ? 1 : -1;
  const slope = Math.max(-.08, Math.min(.08, wind.vy / Math.max(.001, Math.abs(wind.vx))));
  const sample = (x: number, y: number, offset: number, fallback: number) => {
    const px = Math.max(0, Math.min(w - 1, (x - direction * offset) * w));
    const py = Math.max(0, Math.min(h - 1, (y - slope * offset * .35) * h));
    const ix = Math.floor(px), iy = Math.floor(py), tx = px - ix, ty = py - iy;
    const x1 = Math.min(w - 1, ix + 1), y1 = Math.min(h - 1, iy + 1);
    const j00 = iy * w + ix, j10 = iy * w + x1, j01 = y1 * w + ix, j11 = y1 * w + x1;
    const a = pass.mask[j00]! > 24 ? pass.luma[j00]! : fallback;
    const b = pass.mask[j10]! > 24 ? pass.luma[j10]! : fallback;
    const c = pass.mask[j01]! > 24 ? pass.luma[j01]! : fallback;
    const d = pass.mask[j11]! > 24 ? pass.luma[j11]! : fallback;
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  for (const i of pass.indices) {
    const x = (i % w) / w, y = Math.floor(i / w) / h;
    const flow = cloudFlowOffset(x, y, wind.x, wind.y, wind.vx, wind.vy, cloudFlowScratch);
    const sx = Math.max(0, Math.min(w - 1, Math.round((x - flow.x) * w)));
    const sy = Math.max(0, Math.min(h - 1, Math.round((y - flow.y) * h)));
    const sampled = sy * w + sx, p = i * 4, q = sampled * 4;
    const shade = flow.shade;
    // Always render this plate's own photograph, never an interpolated sky
    // fill: where the upwind sample has no cloud the pixel stays exactly as
    // photographed, so the bank silhouette cannot smoke, thin out or drift.
    if (pass.mask[sampled]! > 24) {
      data[p] = pass.source[q]! * shade; data[p + 1] = pass.source[q + 1]! * shade; data[p + 2] = pass.source[q + 2]! * shade;
    } else {
      data[p] = pass.source[p]! * shade; data[p + 1] = pass.source[p + 1]! * shade; data[p + 2] = pass.source[p + 2]! * shade;
    }
    // Dense interiors retain photographic contrast; softer boundaries receive
    // more relative advection, while both parcels share one wind trajectory.
    const edge = 1 - pass.mask[i]! / 255;
    const depth = .65 + .35 * edge;
    // Illumination belongs to the destination atmosphere, not to a travelling
    // coloured patch. Advect relief, then relight with the local plate colour.
    const sourceLuma = pass.luma[i]!;
    const movingLuma = (sample(x, y, parcelA.offset * depth, sourceLuma) * parcelA.weight
      + sample(x, y, parcelB.offset * depth, sourceLuma) * parcelB.weight) * shade;
    // The cloud's own moving relief becomes a more legible shadow while the
    // destination's colour and sharp photographic detail remain stationary.
    const relief = Math.max(.35, Math.min(1, 1 + 3 * (movingLuma - sourceLuma) / (sourceLuma + 16)));
    // Modulate the sharp static photography instead of replacing its detail
    // with a small moving raster. Only neutral cloud shadow moves here.
    for (let ch = 0; ch < 3; ch++) data[p + ch] = Math.round(255 * Math.min(1, relief));
    const a = Math.round(weight * erodedAlpha(pass.mask[i]!, x, y, wind.x, wind.y, wind.vx, wind.vy, clear));
    data[p + 3] = a; alpha[p + 3] = a;
    highlight[p + 3] = Math.round(a / 255 * Math.min(pass.highlight[i]!, pass.highlight[sampled]!));
  }
  pass.canvas.getContext('2d')!.putImageData(pass.output, 0, 0);
  pass.alphaCanvas.getContext('2d')!.putImageData(pass.alphaImage, 0, 0);
  pass.highlightCanvas.getContext('2d')!.putImageData(pass.highlightImage, 0, 0);
  skyContext!.save();
  skyContext!.globalCompositeOperation = 'multiply';
  skyContext!.drawImage(pass.canvas, 0, 0, width, height);
  skyContext!.restore();
}
let lightningCanvas: HTMLCanvasElement | null = null;
function drawBackgroundLightning(width: number, height: number, flashes: readonly CloudFlash[], nextIndex: number, blend: number) {
  if (!flashes.length) return;
  if (!lightningCanvas) { lightningCanvas = document.createElement('canvas'); lightningCanvas.width = 320; lightningCanvas.height = 180; }
  const ctx = lightningCanvas.getContext('2d')!, w = lightningCanvas.width, h = lightningCanvas.height;
  ctx.clearRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  for (const flash of flashes) {
    const x = flash.x * w, y = flash.y * h, radius = Math.max(10, flash.radius * h * 2);
    const color = flash.color ?? [38, 34, 30];
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(${color.join(',')},${Math.min(1, flash.strength)})`); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'destination-in';
  const mask = backgroundThunderVisible ? backgroundThunderCanvases[skyBackgroundIndex] : null;
  // Strict masking source: the current background plate's own highlight —
  // repainted every frame with the displaced bright billow. The discharge can
  // only ever appear inside the photographic cloud's bright body; procedural
  // foreground or generic cloud masks may never confine or host it.
  if (mask) ctx.drawImage(mask, 0, 0, w, h); else ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  skyContext!.save(); skyContext!.globalCompositeOperation = 'screen';
  skyContext!.drawImage(lightningCanvas, 0, 0, width, height); skyContext!.restore();
}
function drawSkyCloudLayer(width: number, height: number, time: number, elapsed: number) {
  const activeSlot = skySlotAt(skyBackgroundElapsed).slot;
  if (!skyPreview && imageReady(skyBackgroundImages[backgroundAt(activeSlot)]!) &&
      imageReady(skyBackgroundImages[backgroundAt(activeSlot + 1)]!)) skyBackgroundElapsed += elapsed * skyTimeScale;
  const { slot, within, duration } = skySlotAt(skyBackgroundElapsed);
  const phase = slot % 8;
  const next = (phase + 1) % 8;
  const currentImage = backgroundAt(slot), nextImageIndex = backgroundAt(slot + 1);
  // Variable cross window: each phase draws its own randomized fraction of its
  // (already variable) length, so transitions stay fast and never share one
  // fixed duration. Galaxy phases are 8 min, so their fade stays long.
  const transition = duration * skyPhaseSplits[slot]!;
  const mix = Math.max(0, Math.min(1, (within - (duration - transition)) / transition));
  // Round imperceptible endpoint fractions so the final image is composited
  // at exactly full opacity before its phase becomes the primary image.
  const blend = mix > .999 ? 1 : mix < .001 ? 0 : mix * mix * (3 - 2 * mix);
  skyBackgroundIndex = currentImage;
  backgroundThunderVisible = blend === 0 && currentImage !== GALAXY_INDEX;
  const ctx = skyContext!, image = skyBackgroundImages[currentImage]!, nextImage = skyBackgroundImages[nextImageIndex]!;
  cloudSeconds += elapsed / 1000 * renderedWeather.speed * SKY_CLOUD_SPEED;
  // The photographic background, its stars and the Milky Way band stay fixed.
  if (currentImage !== nextImageIndex)
    drawSpatialBackgroundTransition(ctx, image, nextImage, width, height, blend, skyMotion[0]!.vx);
  else drawStaticBackgroundTransition(ctx, image, nextImage, width, height, blend);
  // The live sky events are behind moving clouds. Their cloud alpha and the
  // lightning mask use the same slowly changing weather and clearing factor.
  drawSkyMicroEvents(width, height, time);
  const clearing = cloudClearing(phase, blend);
  const backgroundColor = mixSkyColor(skyBackgroundColors[currentImage]!, skyBackgroundColors[nextImageIndex]!, blend);
  const flashes = cloudFlashes(time);
  const localColor = (x: number, y: number) => mixSkyColor(backgroundColorAt(currentImage, x, y), backgroundColorAt(nextImageIndex, x, y), blend);
  // Each cloudscape carries its own local pass. During a crossfade both passes
  // fade with their image's contribution, so the cloud body follows the plate
  // and no cloud region pops at the slot boundary.
  const currentPass = backgroundCloudPasses[currentImage] ? currentImage : -1;
  const nextPass = backgroundCloudPasses[nextImageIndex] ? nextImageIndex : -1;
  if (currentPass >= 0) drawBackgroundCloudPhase(width, height, currentPass,
    currentImage === nextImageIndex ? 1 : 1 - blend, 0);
  if (nextPass >= 0 && nextImageIndex !== currentImage) drawBackgroundCloudPhase(width, height, nextPass, blend, 0);
  if (FOREGROUND_CLOUDS_ENABLED) {
    ensureCloudSurface();
    cloudTexture.render(skyMotion, cloudSeconds, clearing, renderedWeather, [], backgroundColor, localColor);
    cloudImageData!.data.set(cloudTexture.pixels);
    cloudCanvasContext!.putImageData(cloudImageData!, 0, 0);
    // Projector feedback 2026-11-04: crossfading cloudscapes with mismatched
    // hues occasionally clash. The drifting clouds already glide in front of the
    // blend, so mid-transition they are drawn stronger as a moving veil that
    // breaks up the clash; clear (galaxy) phases cap the veil by clearing, and
    // both endpoints reduce to the exact former look.
    const veil = veilWeight(blend, clearing);
    const alphas = veilAlphas(veil);
    ctx.save(); ctx.globalAlpha = alphas.mask; // 0.32 at rest
    ctx.drawImage(cloudCanvas!, 0, 0, cloudTexture.width, cloudTexture.height, 0, 0, width, height);
    ctx.restore();
    // The procedural mask supplies motion; this restrained photographic pass
    // restores the dense billow volume that is visible on the projector while
    // remaining confined to the moving cloud mask.
    drawCloudDetail(width, height, alphas.detail, backgroundColor);
  }
  // Return the discharge list so the caller can composite it on top of the
  // colour wash and shade — the glow must not be dimmed by those passes.
  return flashes;
}
function skyEventFade(kind: SkyMicroEventKind) {
  // The 600ms fade clears Dream-only events when returning Home. Falling
  // stars are allowed on Home too, so they must not share that fade; thunder
  // rides the cloud glow and never passes through here.
  return kind === 'meteor' && !isSkyDream() ? 1 : skyEventVisibility;
}
function drawSkyMicroEvent(event: SkyMicroEvent, width: number, height: number, time: number) {
  const ctx = skyContext!;
  const progress = Math.max(0, Math.min(1, (time - event.startsAt) / (event.endsAt - event.startsAt)));
  const fade = skyEventFade(event.kind) * Math.max(0, Math.min(1, progress / .18, (1 - progress) / .2));
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
  } else if (event.kind === 'binary-star') {
    const angle = progress * 2.8 + event.seed;
    point(x + Math.cos(angle) * 4 * unit, y + Math.sin(angle) * 2 * unit, 1.1, 'rgba(185,201,215,.55)');
    point(x - Math.cos(angle) * 4 * unit, y - Math.sin(angle) * 2 * unit, .85, 'rgba(200,175,148,.45)');
  } else if (event.kind === 'dust-drift') {
    for (let i = 0; i < 7; i++) {
      const px = x + (progress * 22 + i * 5) * unit;
      const py = y + Math.sin(event.seed + i * 2.4 + progress) * 13 * unit;
      point(px, py, .55 + (i % 2) * .2, 'rgba(154,173,188,.22)');
    }
  } else if (event.kind === 'planet-glint') {
    ctx.globalAlpha = fade * Math.sin(progress * Math.PI) ** 2;
    point(x, y, 1.7, 'rgba(193,183,157,.58)');
    point(x, y, .65, 'rgba(209,208,194,.4)');
  } else if (event.kind === 'star-cluster') {
    for (let i = 0; i < 6; i++) {
      ctx.globalAlpha = fade * (.5 + .3 * Math.sin(progress * 4 + i));
      point(x + Math.sin(i * 8.3 + event.seed) * 15 * unit, y + Math.cos(i * 5.7 + event.seed) * 9 * unit, .8, 'rgba(178,196,210,.5)');
    }
  } else if (event.kind === 'firefly-pair') {
    for (let i = 0; i < 2; i++) {
      ctx.globalAlpha = fade * (.5 + .25 * Math.sin(progress * 5 + i * 2));
      point(x + Math.sin(progress * 3 + i * 2 + event.seed) * 15 * unit, y - progress * 12 * unit + Math.cos(progress * 4 + i * 3) * 6 * unit, 1.1, 'rgba(187,204,151,.5)');
    }
  } else if (event.kind === 'meteor') {
    const px = x + progress * width * .19, py = y + progress * height * .13;
    const tailX = px - width * .065, tailY = py - height * .045;
    const trail = ctx.createLinearGradient(tailX, tailY, px, py);
    trail.addColorStop(0, 'rgba(180,206,220,0)'); trail.addColorStop(1, 'rgba(210,224,229,.52)');
    ctx.strokeStyle = trail; ctx.lineWidth = unit;
    ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(px, py); ctx.stroke();
    point(px, py, 1.2, 'rgba(223,232,234,.65)');
  } else if (event.kind === 'satellite') {
    point(x + (progress - .5) * width * .55, y - progress * height * .09, 1.25, 'rgba(210,223,227,.66)');
  } else if (event.kind === 'constellation') {
    const patterns = [ [[0,0],[17,-10],[32,3],[51,-16]], [[0,0],[12,18],[30,24],[43,9],[28,-4]],
      [[0,0],[15,-15],[30,0],[15,15],[0,0]], [[0,0],[9,-17],[17,-7],[28,-23],[39,-12]] ];
    const nodes = patterns[Math.floor(event.seed) % patterns.length]!;
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
  } else if (event.kind === 'meteor-shower') {
    // Three staggered tiny streaks belong to one event, never three schedulers.
    for (let i = 0; i < 3; i++) {
      const p = (progress - i * .22) / .5;
      if (p <= 0 || p >= 1) continue;
      ctx.globalAlpha = skyEventVisibility * Math.sin(p * Math.PI) * .32;
      ctx.strokeStyle = '#b8c6cf'; ctx.lineWidth = unit;
      const px = x + (i * .04 + p * .13) * width, py = y + (i * .035 + p * .10) * height;
      ctx.beginPath(); ctx.moveTo(px - width * .018, py - height * .014); ctx.lineTo(px, py); ctx.stroke();
    }
  } else if (event.kind === 'comet') {
    // One slow, patient visitor: bright head, faint curved dust tail, no fast
    // streak. Visible for 21s so it can calmly cross third of the sky.
    const px = x + progress * width * .34, py = y + progress * height * .2 + Math.sin(progress * Math.PI) * height * .03;
    const tailX = px - width * .12, tailY = py - height * .075;
    const tail = ctx.createLinearGradient(tailX, tailY, px, py);
    tail.addColorStop(0, 'rgba(196,214,224,0)'); tail.addColorStop(.7, 'rgba(198,214,224,.14)'); tail.addColorStop(1, 'rgba(214,226,232,.3)');
    ctx.strokeStyle = tail; ctx.lineWidth = 1.6 * unit;
    ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(px, py); ctx.stroke();
    const glow = ctx.createRadialGradient(px, py, 0, px, py, 5 * unit);
    glow.addColorStop(0, 'rgba(220,228,234,.4)'); glow.addColorStop(1, 'rgba(220,228,234,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, 5 * unit, 0, Math.PI * 2); ctx.fill();
    point(px, py, 1.25, 'rgba(226,233,236,.66)');
  } else if (event.kind === 'flare') {
    // One sharp glint that swells and folds away; clouds absorb it, so it is
    // invisible through cloudy frames instead of glowing on top of them.
    const mask = skyBackgroundMasks[skyBackgroundIndex];
    const sample = mask?.getContext('2d', { willReadFrequently: true })?.getImageData(
      Math.max(0, Math.min(319, Math.floor(x / width * 320))),
      Math.max(0, Math.min(179, Math.floor(y / height * 180))), 1, 1).data[3] ?? 0;
    const open = 1 - sample / 255;
    if (open > .02) {
      const rise = Math.sin(progress * Math.PI) ** 2 * open;
      ctx.globalAlpha = fade * rise;
      ctx.strokeStyle = 'rgba(212,220,226,.4)'; ctx.lineWidth = .7 * unit;
      const span = 7 * unit * rise;
      ctx.beginPath(); ctx.moveTo(x - span, y); ctx.lineTo(x + span, y);
      ctx.moveTo(x, y - span * .7); ctx.lineTo(x, y + span * .7); ctx.stroke();
      point(x, y, 1.5, 'rgba(222,229,233,.62)');
    }
  } else if (event.kind === 'star-dance') {
    // A loose patch of stars starts twinkling together, then settles back.
    for (let i = 0; i < 12; i++) {
      const spot = Math.sin(event.seed * 12.9898 + i * 78.233) * 43758.5453;
      const ox = ((spot % 1) + 1) % 1 * 46 - 23;
      const oy = ((Math.abs(Math.sin(event.seed * 4.141 + i * 12.9898)) * 43758.5453) % 1) * 26 - 13;
      const phase = (i * .53 + event.seed % 1) % 1;
      const twinkle = Math.max(.08, Math.sin(progress * Math.PI * 2 * 1.6 + phase * Math.PI * 2) ** 2);
      ctx.globalAlpha = fade * (.3 + .32 * twinkle);
      point(x + ox * unit, y + oy * unit, .55 + (i % 3) * .16, 'rgba(206,220,230,.55)');
    }
  } // Thunder is drawn as a glow masked by the actual cloud masses.

  ctx.restore();
}

function paintLiquidSky(time: number) {
  skyFrame = 0;
  if (!skyContext || document.hidden || skyReducedMotion.matches) return;
  if (time - lastSkyPaint + .01 < skyFrameIntervalMs) { skyFrame = requestAnimationFrame(paintLiquidSky); return; }
  const elapsed = skyPreview ? 0 : Math.min(250, Math.max(0, time - skyLastTime));
  skyLastTime = time;
  lastSkyPaint = time - ((time - lastSkyPaint + .01) % skyFrameIntervalMs) + .01;
  if (!imageReady(skyBackgroundImages[backgroundAt(skySlotAt(skyBackgroundElapsed).slot)]!)) {
    skyFrame = requestAnimationFrame(paintLiquidSky); return;
  }
  const width = skyCanvas.clientWidth || 1280, height = skyCanvas.clientHeight || 720;
  const dream = isSkyDream();
  if (dream !== skyWasDream) {
    targetWeather = chooseWeather(Math.random);
    nextSkyVariation = time + (dream ? SKY_RETARGET_DREAM_MS : SKY_RETARGET_HOME_MS);
    nextSkyMicroEventAt = time + (dream ? 18_000 : 60_000) + Math.random() * (dream ? 45_000 : 90_000);
    skyWasDream = dream;
    // Present the existing bitmap for the first frame of either mode. Do not
    // advance weather, wind, noise, events, wash or resize at this boundary.
    skyFrame = requestAnimationFrame(paintLiquidSky);
    return;
  }
  skyEventVisibility = Math.max(0, Math.min(1, skyEventVisibility + (dream ? 1 : -1) * elapsed / 600));
  const ratio = Math.min(1, SKY_MAX_RENDER_WIDTH / width, SKY_MAX_RENDER_HEIGHT / height);
  const renderWidth = Math.max(1, Math.round(width * ratio)), renderHeight = Math.max(1, Math.round(height * ratio));
  if (backCanvas.width !== renderWidth) backCanvas.width = renderWidth;
  if (backCanvas.height !== renderHeight) backCanvas.height = renderHeight;
  const lastGoodElapsed = skyBackgroundElapsed;
  try {
  skyContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (!skyPreview && time > nextSkyVariation) retargetSky(time);
  advanceWeather(skyWeather, targetWeather, elapsed);
  skyDreamBlend = smoothToward(skyDreamBlend, dream ? 1 : 0, 1 - Math.exp(-elapsed / 8_000));
  renderedWeather = weatherForMode(skyWeather, skyDreamBlend);
  skyMotion.forEach(field => advanceWind(field, elapsed * renderedWeather.speed * SKY_CLOUD_SPEED));
  // Time share refers to Dream time: a 36-minute cloudscape phase followed
  // by a 12-minute Milky Way phase. Slow easing makes both boundaries gradual.
  if (dream && !skyMilkyPreview) dreamSkyElapsed += elapsed;
  const milkyTarget = dream ? (skyMilkyPreview ? .85 : milkyPhase(dreamSkyElapsed)) : 0;
  milkyReveal = smoothToward(milkyReveal, milkyTarget, 1 - Math.exp(-elapsed / 420_000));
  skyContext.globalCompositeOperation = 'source-over'; skyContext.globalAlpha = 1;
  const flashes = drawSkyCloudLayer(width, height, time, elapsed);
  skyMood = smoothToward(skyMood, targetSkyMood, 1 - Math.exp(-elapsed / 155_000));
  const wash = skyContext.createRadialGradient(width * .42, height * .35, 0, width * .52, height * .5, width * .7);
  const blend = skyMood - Math.floor(skyMood);
  const washColor = (stop: 0 | 1) => {
    const sample = (moods: typeof skyMoods | typeof dreamSkyMoods, opacity: number) => {
      const a = moods[Math.min(moods.length - 1, Math.floor(skyMood))]![stop].match(/[\d.]+/g)!.map(Number);
      const b = moods[Math.min(moods.length - 1, Math.ceil(skyMood))]![stop].match(/[\d.]+/g)!.map(Number);
      return a.map((v, i) => (v + (b[i]! - v) * blend) * (i === 3 ? opacity : 1));
    };
    const home = sample(skyMoods, 1), richer = sample(dreamSkyMoods, .4);
    return `rgba(${home.map((v, i) => v + (richer[i]! - v) * skyDreamBlend).join(',')})`;
  };
  wash.addColorStop(0, washColor(0)); wash.addColorStop(.55, washColor(1)); wash.addColorStop(1, `rgba(2,5,12,${.34 - .16 * skyDreamBlend})`);
  skyContext.fillStyle = wash; skyContext.fillRect(0, 0, width, height);
  // Final wash is composited on the same canvas; Dream loses part of the old
  // extra darkening so lit billow tops reach the reference tonal range.
  const shade = skyContext.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, `rgba(5,9,17,${.10 - .09 * skyDreamBlend})`);
  shade.addColorStop(1, `rgba(4,7,14,${.24 - .18 * skyDreamBlend})`);
  skyContext.fillStyle = shade; skyContext.fillRect(0, 0, width, height);
  // Thunder rides the cloud highlights after the wash and shade, so the
  // discharge keeps projector-visible strength without ever leaving a cloud.
  if (flashes.length) drawBackgroundLightning(width, height, flashes, 0, 0);
  // Swap complete frames; the previously displayed bitmap stays intact on failure.
  presentationContext.globalCompositeOperation = 'source-over';
  presentationContext.drawImage(backCanvas, 0, 0, skyCanvas.width, skyCanvas.height);
  skyCanvas.style.visibility = 'visible';
  } catch (error) {
    skyBackgroundElapsed = lastGoodElapsed;
    console.error('Sky frame retained after rendering failure', error);
    skyFrame = requestAnimationFrame(paintLiquidSky);
    return;
  }
  activeSkyMicroEvents = activeSkyMicroEvents.filter(event => time < event.endsAt);
  // Back on Home only the allowed kinds survive the fade: thunder inside the
  // clouds and the occasional falling star.
  if (!dream && skyEventVisibility === 0) {
    activeSkyMicroEvents = activeSkyMicroEvents.filter(event => event.kind === 'thunder' || event.kind === 'meteor');
  }
  if (!skyReducedMotion.matches && !skyPreview && time >= nextSkyMicroEventAt) startSkyMicroEvent(time);
  skyFrame = requestAnimationFrame(paintLiquidSky);
}
function startSkyRendering() {
  if (legacySkyEnabled && !hybridSkyPending && !hybridSkyActive && !document.hidden && !skyReducedMotion.matches && skyFrame === 0) {
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

// Keep the matching hybrid still visible while loading or on a failure.
const hybridDebug = Boolean(import.meta.env.DEV || window.LunaHost?.rendererQA?.());
const skyMicroName = hybridParams.get('microTrial');
const skyMicroTrial = hybridDebug && !hybridParams.has('milkyTrial')
  && (skyMicroName === 'twinkle' || skyMicroName === 'meteor' || skyMicroName === 'ufo' || skyMicroName === 'satellite') ? skyMicroName : undefined;
// Native defaults are available in the release build. URL overrides are QA
// tools and remain disabled outside a development/debug build.
const hybridOptionsAllowed = !(hybridDebug && hybridParams.has('milkyTrial')) && !skyMicroTrial && !(hybridDebug && hybridParams.has('gasBaseline'));
const gasTrialEnabled = hybridOptionsAllowed && ((hybridDebug && hybridParams.has('gasTrial')) || window.LunaHost?.gasTrialDefault?.() === true);
const floorTrialEnabled = hybridOptionsAllowed && ((hybridDebug && hybridParams.has('floorTrial')) || window.LunaHost?.floorTrialDefault?.() === true);
const strongerGasTrialEnabled = hybridOptionsAllowed && ((hybridDebug && hybridParams.has('strongerGasTrial')) || window.LunaHost?.strongerGasTrialDefault?.() === true);
const orbitalTrialEnabled = hybridOptionsAllowed && ((hybridDebug && hybridParams.has('orbitalTrial')) || window.LunaHost?.orbitalTrialDefault?.() === true);
const cinematicTrialEnabled = hybridOptionsAllowed && (orbitalTrialEnabled || (hybridDebug && hybridParams.has('cinematicTrial')) || window.LunaHost?.cinematicTrialDefault?.() === true);
const livingTrialEnabled = hybridOptionsAllowed && (cinematicTrialEnabled || (hybridDebug && hybridParams.has('livingTrial')) || window.LunaHost?.livingTrialDefault?.() === true);
const phasePreview = Number(hybridParams.get('skyPhasePreview'));
const previewLivingPhase = hybridDebug && orbitalTrialEnabled && hybridParams.has('skyPhasePreview') && Number.isFinite(phasePreview)
  ? Math.max(0, Math.min(814_999, phasePreview)) : undefined;
if (!legacySkyEnabled && !skyReducedMotion.matches) {
  const hybrid = new HybridSky(ambientScene, {
    thunderTest: thunderTest && hybridDebug,
    timeScale: hybridDebug && hybridParams.has('hybridFast') ? 30 : 1,
    microCloud: hybridDebug && !hybridParams.has('milkyTrial') && !skyMicroTrial && !gasTrialEnabled && !floorTrialEnabled && !strongerGasTrialEnabled && !livingTrialEnabled && (hybridParams.has('microCloud') || hybridParams.has('microCloudTest')),
    microCloudTest: hybridDebug && hybridParams.has('microCloudTest'),
    milkyTrial: hybridDebug && hybridParams.has('milkyTrial'),
    milkyPreviewSpeed: hybridDebug && hybridParams.has('milkyFast') ? 15 : 1,
    gasTrial: gasTrialEnabled,
    floorTrial: floorTrialEnabled,
    strongerGasTrial: strongerGasTrialEnabled || cinematicTrialEnabled,
    livingTrial: livingTrialEnabled,
    cinematicTrial: cinematicTrialEnabled,
    orbitalTrial: orbitalTrialEnabled,
    previewLivingPhase,
    livingFast: hybridDebug && livingTrialEnabled && hybridParams.has('livingFast'),
    skyMicroTrial,
    onReady: () => { hybridSkyPending = false; hybridSkyActive = true; stopSkyRendering(); skyCanvas.style.visibility = 'hidden'; },
    onFailure: error => { console.error('Hybrid sky unavailable; retaining matching still', error); hybridSkyPending = false; hybridSkyActive = false; },
  });
  document.addEventListener('visibilitychange', () => document.hidden ? hybrid.pause() : hybrid.resume());
  skyReducedMotion.addEventListener('change', () => skyReducedMotion.matches ? hybrid.pause() : hybrid.resume());
  void hybrid.start();
}

armIdleDreamTimer();
