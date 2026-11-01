# Projector UI

Local fullscreen projector-home app for Luna. V2 test build: `0.2.6` (Android version code 8).

## Run locally

```bash
npm install
npm run dev
```

The prototype supports keyboard navigation and the browser Gamepad API:

- Arrow keys / D-pad / left stick: navigate
- Enter / Space / A: select
- Escape / Backspace / B: back

## Navigation

- Up from the app row focuses the system-menu trigger; there is no horizontal navigation drawer.
- The system drawer contains Settings, Wi-Fi, Input, All Apps, Atmosphere and Exit to Stock UI, in that order. Opening it always selects Settings first. Up/down reaches every item, including Exit to Stock UI.
- All Apps is a separate full-screen Luna page with a six-column grid of installed TV apps. It uses the system's application labels and icons but keeps Luna's dark sky background and design language. Back closes it and restores the Luna carousel.
- All Apps includes a Home Apps button. There, check or uncheck exactly which apps appear on Luna Home; the choice is saved locally and updates the carousel immediately.
- Exit opens a confirmation with No selected. Left/right chooses No/Yes; Back cancels and returns to the exit button.
- Tab follows normal browser navigation outside dialogs. Inside the system drawer or confirmation it stays within the open dialog; Escape leaves it.
- Held select/back is ignored. On the physical projector remote, a direction moves once immediately; it only starts repeating after a deliberate 650 ms hold, at a measured 220 ms interval. Near-simultaneous duplicate direction signals within 400 ms are ignored.

Keyboard, gamepad and pointer use `src/focus-controller.ts`. Tests import the compiled production controller; they do not duplicate its navigation rules. Native DOM focus is reconciled with the controller, including Tab and pointer changes.

The background is independent of all UI state: menus, focus and returning from a system screen do not scale, move or reset it. Its local Milky Way, cloud, dust and star layers each have their own long, muted blue-grey and dusty grey-violet cycle. Lightning has been removed. Preferences are optional: unavailable browser storage does not prevent startup. Reduced motion also disables confirmation and logo-scale motion.

On Android, the browser fallback remains a demo. The test APK exposes a narrow local-only bridge for real app starts, XGIMI HDMI Inputs, Android TV Wi-Fi/Settings, and an explicit return to the verified stock launcher.

The Luna Home screen also includes a Spotify status bubble. It detects an installed Spotify Leanback activity and opens that app through the local bridge; in a browser fallback it remains a safe “not connected” state. Previous/next transport controls stay disabled until a real player session exists, so the UI does not claim playback it cannot verify. Live Spotify playback and account status still require the owner to register a Spotify Developer application, provide its client ID, configure an Android deep-link redirect URI for this package, and approve the requested OAuth scopes. No credentials or tokens are included in this build.

## Checks

```bash
npm run build
npm test
```

The controller/input regression tests use the actual menu counts. They cover all drawer entries, exit cancellation/confirmation, first focus on Settings, and Back preserving the app carousel. Physical remote acceptance is a separate check on the projector.

## XGIMI Horizon test app

The checked projector is an XGIMI Horizon XK03H / `xgimigalileo`, Android TV 11, build `RT.3.24.327`. The Android wrapper lives in `android/` and uses a local WebView bundle; it does not load the home screen from the network.

Build the debug APK without installing Android Studio:

```sh
bash android/build-docker.sh
adb -s <projector-ip>:5555 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s <projector-ip>:5555 shell am start -n nl.bastiaandejong.luna/.MainActivity
```

`nl.bastiaandejong.luna` is a Leanback app with its explicit `HOME` alias enabled for the approved rollout. The stock launcher remains available through Luna's documented “Exit to Stock UI” route, which targets `com.google.android.tvlauncher/.MainActivity` explicitly.

All Apps is queried locally from Android TV's Leanback app catalogue and launches the selected component from Luna. Luna refreshes that local catalogue whenever it resumes, so an app installed later through Play Store (such as Jellyfin) appears without editing Luna. This deliberately excludes ordinary Android maintenance components that do not belong in a TV launcher. Discover, Search and Shop are absent by request. The disabled Google TV search package remains disabled; V2 does not change the cleanup policy.

Atmosphere opens XGIMI Wall only when `com.xgimi.atmosphere` is available. It never changes Luna's own background; the cleanup currently keeps that XGIMI package disabled. The APK also supplies `LunaDreamService`, a non-interactive Android DreamService that shows only Luna's moving stars and clouds. Selecting it as the screensaver does not make Luna the Home app or start it at boot.

Test with the physical remote: app-row launch and return for every service, All Apps launch and return, Home Apps selection, Inputs, Wi-Fi, Android TV Settings, and the confirmed “Exit to stock UI” route. The stock exit always targets `com.google.android.tvlauncher/.MainActivity` explicitly.

## Reversible cleanup

The matching XGIMI profile has been adapted with Prime Video deliberately kept enabled. The exact package policy and full restore procedure are in [docs/xgimi-horizon-recovery.md](docs/xgimi-horizon-recovery.md). Packages are disabled for user 0 only; none are uninstalled.
