export type Zone = 'apps' | 'nav-trigger' | 'nav' | 'system-trigger' | 'system' | 'confirm';
export type Action = 'left' | 'right' | 'up' | 'down' | 'ok' | 'back';
export type Effect = { type: 'app' | 'navigation' | 'system'; index: number } | { type: 'stock-exit' };

export interface FocusState {
  zone: Zone;
  appIndex: number;
  navIndex: number;
  systemIndex: number;
  confirmIndex: number;
}

// Keyboard, gamepad and pointer all use this single navigation model.
export function createFocusController(appCount: number, navCount: number, systemCount: number, initialApp = 2) {
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  const state: FocusState = {
    zone: 'apps', appIndex: clamp(initialApp, appCount - 1), navIndex: 0, systemIndex: 0, confirmIndex: 0,
  };

  function focus(zone: Zone, index = 0) {
    state.zone = zone;
    if (zone === 'apps') state.appIndex = clamp(index, appCount - 1);
    if (zone === 'nav') state.navIndex = clamp(index, navCount - 1);
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
    if (state.zone === 'nav') {
      if (action === 'left') {
        if (state.navIndex === 0) state.zone = 'nav-trigger';
        else state.navIndex--;
      }
      if (action === 'right') {
        if (state.navIndex === navCount - 1) state.zone = 'system-trigger';
        else state.navIndex++;
      }
      if (action === 'back') state.zone = 'nav-trigger';
      if (action === 'down') state.zone = 'apps';
      if (action === 'ok') return { type: 'navigation', index: state.navIndex };
      return;
    }
    if (state.zone === 'apps') {
      if (action === 'left') state.appIndex = clamp(state.appIndex - 1, appCount - 1);
      if (action === 'right') state.appIndex = clamp(state.appIndex + 1, appCount - 1);
      if (action === 'up') state.zone = 'nav-trigger';
      if (action === 'ok') return { type: 'app', index: state.appIndex };
      return;
    }
    if (action === 'down' || action === 'back') state.zone = 'apps';
    else if (state.zone === 'nav-trigger') {
      if (action === 'right') state.zone = 'system-trigger';
      if (action === 'ok') focus('nav', 0);
    } else {
      if (action === 'left') state.zone = 'nav-trigger';
      if (action === 'ok') focus('system', 0);
    }
  }

  return { state, focus, handle };
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
        if (repeat && now - lastNavigationAt < 110) return;
        lastNavigationAt = now;
      }
      return action;
    },
  };
}
