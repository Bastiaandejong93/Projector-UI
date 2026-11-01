export type Zone = 'apps' | 'spotify' | 'all-apps' | 'all-apps-trigger' | 'home-apps' | 'home-apps-trigger' | 'system-trigger' | 'system' | 'confirm';
export type Action = 'left' | 'right' | 'up' | 'down' | 'ok' | 'back';
export type Effect = { type: 'app' | 'all-app' | 'home-app' | 'system' | 'spotify'; index: number } | { type: 'stock-exit' };

export interface FocusState {
  zone: Zone;
  appIndex: number;
  spotifyIndex: number;
  allAppsIndex: number;
  homeAppsIndex: number;
  systemIndex: number;
  confirmIndex: number;
}

// Keyboard, gamepad and pointer all use this single navigation model.
export function createFocusController(initialAppCount: number, initialAllAppsCount: number, systemCount: number, initialApp = 2, initialSpotifyCount = 0) {
  const allAppsColumns = 6;
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  let appCount = initialAppCount;
  let allAppsCount = initialAllAppsCount;
  let spotifyCount = Math.max(0, initialSpotifyCount);
  const state: FocusState = {
    zone: 'apps', appIndex: clamp(initialApp, appCount - 1), spotifyIndex: 1, allAppsIndex: 0, homeAppsIndex: 0, systemIndex: 0, confirmIndex: 0,
  };

  function focus(zone: Zone, index = 0) {
    state.zone = zone;
    if (zone === 'apps') state.appIndex = clamp(index, appCount - 1);
    if (zone === 'spotify') state.spotifyIndex = clamp(index, spotifyCount - 1);
    if (zone === 'all-apps') state.allAppsIndex = clamp(index, allAppsCount - 1);
    if (zone === 'home-apps') state.homeAppsIndex = clamp(index, allAppsCount - 1);
    // The final drawer item is the stock-launcher exit.
    if (zone === 'system') state.systemIndex = clamp(index, systemCount);
    if (zone === 'confirm') state.confirmIndex = clamp(index, 1);
  }

  function handle(action: Action): Effect | undefined {
    if (state.zone === 'confirm') {
      if (action === 'left' || action === 'up') state.confirmIndex = 0;
      if (action === 'right' || action === 'down') state.confirmIndex = 1;
      if (action === 'back' || (action === 'ok' && state.confirmIndex === 0)) focus('system', systemCount);
      else if (action === 'ok') {
        state.zone = 'apps';
        return { type: 'stock-exit' };
      }
      return;
    }

    if (state.zone === 'spotify') {
      if (action === 'left') state.spotifyIndex = clamp(state.spotifyIndex - 1, spotifyCount - 1);
      if (action === 'right') state.spotifyIndex = clamp(state.spotifyIndex + 1, spotifyCount - 1);
      if (action === 'up' || action === 'back') state.zone = 'apps';
      if (action === 'ok') return { type: 'spotify', index: state.spotifyIndex };
      return;
    }

    if (state.zone === 'system') {
      if (action === 'up') state.systemIndex = clamp(state.systemIndex - 1, systemCount);
      if (action === 'down') state.systemIndex = clamp(state.systemIndex + 1, systemCount);
      if (action === 'back' || action === 'left') state.zone = 'system-trigger';
      if (action === 'ok') {
        if (state.systemIndex === systemCount) focus('confirm', 0);
        else return { type: 'system', index: state.systemIndex };
      }
      return;
    }

    if (state.zone === 'all-apps') {
      if (action === 'left') state.allAppsIndex = clamp(state.allAppsIndex - 1, allAppsCount - 1);
      if (action === 'right') state.allAppsIndex = clamp(state.allAppsIndex + 1, allAppsCount - 1);
      if (action === 'up') {
        if (state.allAppsIndex >= allAppsColumns) state.allAppsIndex -= allAppsColumns;
        else state.zone = 'all-apps-trigger';
      }
      if (action === 'down' && state.allAppsIndex + allAppsColumns < allAppsCount) state.allAppsIndex += allAppsColumns;
      if (action === 'back') state.zone = 'apps';
      if (action === 'ok') return { type: 'all-app', index: state.allAppsIndex };
      return;
    }

    if (state.zone === 'home-apps') {
      if (action === 'left') state.homeAppsIndex = clamp(state.homeAppsIndex - 1, allAppsCount - 1);
      if (action === 'right') state.homeAppsIndex = clamp(state.homeAppsIndex + 1, allAppsCount - 1);
      if (action === 'up') {
        if (state.homeAppsIndex >= allAppsColumns) state.homeAppsIndex -= allAppsColumns;
        else state.zone = 'home-apps-trigger';
      }
      if (action === 'down' && state.homeAppsIndex + allAppsColumns < allAppsCount) state.homeAppsIndex += allAppsColumns;
      if (action === 'back') state.zone = 'apps';
      if (action === 'ok') return { type: 'home-app', index: state.homeAppsIndex };
      return;
    }

    if (state.zone === 'all-apps-trigger') {
      if (action === 'down') state.zone = 'all-apps';
      if (action === 'back') state.zone = 'apps';
      if (action === 'ok') state.zone = 'home-apps';
      return;
    }

    if (state.zone === 'home-apps-trigger') {
      if (action === 'down') state.zone = 'home-apps';
      if (action === 'back') state.zone = 'apps';
      if (action === 'ok') state.zone = 'all-apps';
      return;
    }

    if (state.zone === 'apps') {
      if (action === 'left') state.appIndex = clamp(state.appIndex - 1, appCount - 1);
      if (action === 'right') state.appIndex = clamp(state.appIndex + 1, appCount - 1);
      if (action === 'up') state.zone = 'system-trigger';
      if (action === 'down' && spotifyCount > 0) focus('spotify', Math.min(1, spotifyCount - 1));
      if (action === 'ok') return { type: 'app', index: state.appIndex };
      return;
    }

    if (action === 'down' || action === 'back') state.zone = 'apps';
    else if (action === 'ok') focus('system', 0);
  }

  function setAppCount(nextAppCount: number) {
    appCount = Math.max(1, nextAppCount);
    state.appIndex = clamp(state.appIndex, appCount - 1);
  }

  function setAllAppsCount(nextAllAppsCount: number) {
    allAppsCount = Math.max(1, nextAllAppsCount);
    state.allAppsIndex = clamp(state.allAppsIndex, allAppsCount - 1);
    state.homeAppsIndex = clamp(state.homeAppsIndex, allAppsCount - 1);
  }

  function setSpotifyCount(nextSpotifyCount: number) {
    spotifyCount = Math.max(0, nextSpotifyCount);
    state.spotifyIndex = spotifyCount > 0 ? clamp(state.spotifyIndex < 0 ? 1 : state.spotifyIndex, spotifyCount - 1) : -1;
    if (spotifyCount === 0 && state.zone === 'spotify') state.zone = 'apps';
  }

  return { state, focus, handle, setAppCount, setAllAppsCount, setSpotifyCount };
}

export function createKeyboardInput() {
  let lastNavigationAt = -Infinity;
  const keys: Record<string, Action> = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    Enter: 'ok', ' ': 'ok', Escape: 'back', Backspace: 'back',
  };
  return {
    recognizes: (key: string) => Object.hasOwnProperty.call(keys, key),
    read(key: string, repeat: boolean, now: number): Action | undefined {
      const action = keys[key];
      if (!action) return;
      // Holding select/back must never activate the next screen underneath it.
      if (repeat && (action === 'ok' || action === 'back')) return;
      if (action !== 'ok' && action !== 'back') {
        if (repeat && now - lastNavigationAt < 55) return;
        lastNavigationAt = now;
      }
      return action;
    },
  };
}
