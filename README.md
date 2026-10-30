# Projector UI

Local fullscreen projector-home prototype for Luna.

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

- Up from the app row focuses the left navigation trigger.
- Left/right switches between the two top triggers; Down returns to the same app.
- Select opens a menu. In the left navigation, left/right traverses Search, Home, Shop, Discover and Apps. Right after Apps reaches the system trigger.
- In the system drawer, up/down reaches every item, including Exit to stock UI.
- Exit opens a confirmation with No selected. Left/right chooses No/Yes; Back cancels and returns to the exit button.
- Tab follows normal browser navigation outside dialogs. Inside the system drawer or confirmation it stays within the open dialog; Escape leaves it.
- Held select/back is ignored. Held directions repeat at a bounded rate.

Keyboard, gamepad and pointer use `src/focus-controller.ts`. Tests import the compiled production controller; they do not duplicate its navigation rules. Native DOM focus is reconciled with the controller, including Tab and pointer changes.

Background animation, the gamepad polling loop and the clock timer pause when the document is hidden. The background layers combine a local Milky Way texture with darker moving cloud layers; colour shifts remain muted blue-grey and dusty grey-violet. Preferences are optional: unavailable browser storage does not prevent startup. The quiet background mode disables lightning and shooting stars; reduced motion also disables confirmation and logo-scale motion.

On Android, the browser fallback remains a demo. The test APK exposes a narrow local-only bridge for real app starts, XGIMI HDMI Inputs, Android TV Wi-Fi/Settings, and an explicit return to the verified stock launcher.

## Checks

```bash
npm run build
npm test
```

Verified on desktop: production build, nine controller/input regression tests, and browser keyboard routes through both menus, exit cancellation/confirmation and Tab focus. A physical controller and the projector have not been validated in this pass.

## XGIMI Horizon test app

The checked projector is an XGIMI Horizon XK03H / `xgimigalileo`, Android TV 11, build `RT.3.24.327`. The Android wrapper lives in `android/` and uses a local WebView bundle; it does not load the home screen from the network.

Build the debug APK without installing Android Studio:

```sh
bash android/build-docker.sh
adb -s <projector-ip>:5555 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s <projector-ip>:5555 shell am start -n nl.bastiaandejong.luna/.MainActivity
```

`nl.bastiaandejong.luna` is only a normal Leanback app in V1. Its `HOME` activity alias is disabled in the manifest, so installing it cannot take over boot or the Home button. Do not enable that alias or choose Luna as default Home until the physical remote acceptance test is complete.

Test with the physical remote: app-row launch and return for every service, Inputs, Wi-Fi, Android TV Settings, ambience cycling, and the confirmed “Exit to stock UI” route. The stock exit always targets `com.google.android.tvlauncher/.MainActivity` explicitly.

## Reversible cleanup

The matching XGIMI profile has been adapted with Prime Video deliberately kept enabled. The exact package policy and full restore procedure are in [docs/xgimi-horizon-recovery.md](docs/xgimi-horizon-recovery.md). Packages are disabled for user 0 only; none are uninstalled.
