export type LunaAppId = 'apple-tv' | 'netflix' | 'prime-video' | 'max' | 'youtube' | 'disney-plus' | 'bilibili' | 'jellyfin' | 'ufc' | 'spotify' | 'vlc';
export type LunaSystemDestination = 'inputs' | 'wifi' | 'settings' | 'atmosphere' | 'spotify-notifications' | 'screensaver';

export interface LunaLaunchableApp {
  label: string;
  component: string;
  icon: string;
}

interface NativeLunaHost {
  launchApp(appId: LunaAppId): boolean;
  launchComponent(component: string): boolean;
  listLaunchableApps(): string;
  openSystem(destination: LunaSystemDestination): boolean;
  exitToStockHome(): boolean;
  getSpotifyPlayback?(): string;
  spotifyAction?(action: 'previous' | 'play-pause' | 'next'): boolean;
}

export interface SpotifyPlayback {
  connected: boolean;
  playing: boolean;
  title: string;
  artist: string;
  artworkUrl?: string;
  positionMs?: number;
  durationMs?: number;
}

declare global {
  interface Window {
    LunaHost?: NativeLunaHost;
  }
}

export function launchNativeApp(appId: LunaAppId): boolean {
  return window.LunaHost?.launchApp(appId) ?? false;
}

export function launchNativeComponent(component: string): boolean {
  return window.LunaHost?.launchComponent(component) ?? false;
}

export function listNativeLaunchableApps(): LunaLaunchableApp[] {
  try {
    const items: unknown = JSON.parse(window.LunaHost?.listLaunchableApps() ?? '[]');
    if (!Array.isArray(items)) return [];
    return items.filter((item): item is LunaLaunchableApp => (
      typeof item?.label === 'string' &&
      typeof item.component === 'string' &&
      typeof item.icon === 'string' &&
      item.icon.startsWith('data:image/')
    ));
  } catch {
    return [];
  }
}

export function openNativeSystem(destination: LunaSystemDestination): boolean {
  return window.LunaHost?.openSystem(destination) ?? false;
}

export function exitToNativeStockHome(): boolean {
  return window.LunaHost?.exitToStockHome() ?? false;
}

export function getSpotifyPlayback(): SpotifyPlayback | undefined {
  try {
    const value: unknown = JSON.parse(window.LunaHost?.getSpotifyPlayback?.() ?? 'null');
    if (!value || typeof value !== 'object') return undefined;
    const playback = value as Partial<SpotifyPlayback>;
    if (typeof playback.connected !== 'boolean' || typeof playback.playing !== 'boolean' || typeof playback.title !== 'string' || typeof playback.artist !== 'string') return undefined;
    return {
      connected: playback.connected,
      playing: playback.playing,
      title: playback.title,
      artist: playback.artist,
      ...(typeof playback.artworkUrl === 'string' ? { artworkUrl: playback.artworkUrl } : {}),
      ...(typeof playback.positionMs === 'number' ? { positionMs: playback.positionMs } : {}),
      ...(typeof playback.durationMs === 'number' ? { durationMs: playback.durationMs } : {}),
    };
  } catch {
    return undefined;
  }
}

export function spotifyAction(action: 'previous' | 'play-pause' | 'next'): boolean {
  return window.LunaHost?.spotifyAction?.(action) ?? false;
}
