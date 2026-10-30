export type LunaAppId = 'apple-tv' | 'netflix' | 'prime-video' | 'max' | 'youtube' | 'disney-plus';
export type LunaSystemDestination = 'inputs' | 'wifi' | 'settings';

interface NativeLunaHost {
  launchApp(appId: LunaAppId): boolean;
  openSystem(destination: LunaSystemDestination): boolean;
  exitToStockHome(): boolean;
}

declare global {
  interface Window {
    LunaHost?: NativeLunaHost;
  }
}

export function launchNativeApp(appId: LunaAppId): boolean {
  return window.LunaHost?.launchApp(appId) ?? false;
}

export function openNativeSystem(destination: LunaSystemDestination): boolean {
  return window.LunaHost?.openSystem(destination) ?? false;
}

export function exitToNativeStockHome(): boolean {
  return window.LunaHost?.exitToStockHome() ?? false;
}
