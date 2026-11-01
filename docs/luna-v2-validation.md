# Luna V2.6 test build — 2026-10-31

Version `0.2.6`, Android version code `8`.

## Scope

- The horizontal navigation and Discover are removed.
- The right drawer is limited to Settings, Wi-Fi, Input, All Apps, Atmosphere and Exit to Stock UI.
- All Apps is Luna's own fullscreen page, not a stock-launcher handoff or an overlay on the home page. Back returns to Luna.
- The native host queries Android's `CATEGORY_LEANBACK_LAUNCHER` activities at runtime. Luna, Settings and the stock launcher are excluded. A newly installed Android TV app is therefore available without changing Luna; the catalogue refreshes whenever Luna resumes.
- The All Apps header opens Home Apps. Its selectable grid decides which discovered apps appear on Luna's home carousel; this is intentionally not a separate drawer item.
- App actions launch the resolved Android component directly. Android's normal task Back behaviour should reveal Luna again after leaving an app.
- Ambient stars, clouds, dust and colour shifts run independently from UI focus, drawers and pages. No UI state applies a transform or pause to the background.
- Projector D-pad input is calibrated natively: the first direction moves immediately, repeats start after 650 ms and are limited to 220 ms, and a same-direction duplicate within 400 ms is dropped.
- The separate `LunaDreamService` remains available as Android's screensaver.

## Build validation

- `npm run build`: passed.
- `npm test`: 17 tests passed.
- `git diff --check`: passed.
- `bash android/build-docker.sh`: passed before installation.

## Device validation

- V2.6 was installed on `192.168.178.174:5555` with `adb install -r`; `dumpsys package` confirms version code `8` and version `0.2.6`.
- The native D-pad gate compiled into the installed APK. Its first direction is immediate; Android repeat events do not pass until the 650 ms deliberate-hold threshold and are then capped to one action per 220 ms. Same-direction duplicate initial events inside 400 ms are rejected.
- A short physical-remote acceptance pass is still useful: verify a normal quick press moves once, then verify a sustained hold begins to repeat only after the intentional delay.
- The live All Apps page showed the resolved Leanback catalogue: AirScreen, Apple TV, BrowseHere, DAZN, Disney+, HBO Max, Internet Browser, Kodi, MagiCast, Netflix, NOS, Play Store, Plex, Prime Video, Spotify, UFC and YouTube. Technical non-TV activities from the earlier generic launcher query are absent.
- Remote navigation opened All Apps, then its Home Apps header. The Home Apps grid showed the selected home services (Apple TV, Disney+, HBO Max, Netflix, Prime Video and YouTube) and allowed the other discovered apps to remain unselected.
- Android Back from Home Apps returned directly to Luna's home carousel. The All Apps and Home Apps screens retained Luna's independent animated ambience.
- Before rollout, the resolved default HOME was `com.google.android.tvlauncher/.MainActivity`; Luna was merely in the foreground for testing.

## Launcher and cleanup policy

For the approved rollout, the HOME alias is enabled and the default HOME is set to `nl.bastiaandejong.luna/.LunaHome`. The in-app “Exit to Stock UI” action remains the documented reversible escape route and explicitly starts `com.google.android.tvlauncher/.MainActivity`.

The existing 21 disabled packages are unchanged. Prime Video remains enabled. No cleanup operations, root, flashing, uninstall or GitHub push were performed.
