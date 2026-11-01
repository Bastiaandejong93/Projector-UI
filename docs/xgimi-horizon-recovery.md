# XGIMI Horizon XK03H: Luna cleanup and recovery

## Verified baseline before cleanup

- Device: XGIMI Horizon XK03H (`xgimigalileo`), Android TV 11, `RT.3.24.327 release-keys`.
- Stock Home: `com.google.android.tvlauncher/.MainActivity`.
- No packages were user-disabled before this cleanup.
- Prime Video is installed and deliberately excluded from the Luna disable list.
- TalkBack is inactive. The standard Colors screensaver is already active.
- The reference profile is CleanYourTV commit `fe9ad3204b945d3aadfb6876ee6ea78c20a1fe73`, checked against the device package inventory.

## Safety policy

`ops/xgimi-horizon-xk03h-rt-3.24.327-luna-disable.txt` contains the exact 21 packages to disable. It is the matching reference profile with Prime Video removed. The cleanup uses `pm disable-user --user 0` through CleanYourTV's checked script; it never uninstalls packages, uses root, disables the stock launcher, or changes firmware.

The source tool writes the original package/home state before changing anything under `~/.cleanyourtv/` on this Mac. Its restore script replays that record, so packages already disabled before a future cleanup stay in their original state.

## Applied result

Applied on 2026-10-30: all 21 listed packages reported `disabled-user`. The verification tool then reported no drift; Prime Video remained enabled, Home still resolved to the stock launcher, and both HDMI Inputs and Android TV Settings still resolved to their original XGIMI/Android components.

The private recovery record is intentionally kept outside this Git repository because it includes local device details. Its SHA-256 at creation is `8b0ebbb0dd76081b657579767b6094d5e19c1c1f6f3050bf0ba958d8c2832482`.

## Restore command

Run this from the CleanYourTV clone with the same list used for cleanup:

```sh
TV_HOST=<projector-ip> tools/restore.sh \
  /Users/bastiaandejong/Documents/Codex/2026-10-29/files-pasted-by-the-user-luna/ops/xgimi-horizon-xk03h-rt-3.24.327-luna-disable.txt \
  com.google.android.tvlauncher
```

After restore, verify that `pm list packages -d` is empty and that Home resolves to `com.google.android.tvlauncher/.MainActivity`.

## Luna screensaver

## Luna Home rollout and recovery

The approved rollout enables `nl.bastiaandejong.luna/.LunaHome` and sets it as the user-0 default HOME. Luna's “Exit to Stock UI” action explicitly starts `com.google.android.tvlauncher/.MainActivity`, so the stock launcher remains reachable without changing firmware or uninstalling Luna.

To restore stock Home while keeping Luna installed:

```sh
adb -s <projector-ip>:5555 shell cmd package set-home-activity --user 0 com.google.android.tvlauncher/.MainActivity
adb -s <projector-ip>:5555 shell am start -n com.google.android.tvlauncher/.MainActivity
```

To return Luna as Home after a later stock session:

```sh
adb -s <projector-ip>:5555 shell cmd package set-home-activity --user 0 nl.bastiaandejong.luna/.LunaHome
adb -s <projector-ip>:5555 shell am start -n nl.bastiaandejong.luna/.MainActivity
```

These commands change only the default Home preference. The package cleanup remains independent and is restored with the procedure above.

Luna V2.4 includes a normal Android DreamService with the same moving stars and clouds as the Luna background. On 2026-10-30, the selected screensaver changed from the standard Colors component to:

```text
nl.bastiaandejong.luna/.LunaDreamService
```

This did not enable XGIMI Atmosphere or Google Backdrop, and did not change the Home or boot launcher. Restore the previous Colors screensaver with:

```sh
adb -s 192.168.178.174:5555 shell settings put secure screensaver_components \
  com.android.dreams.basic/com.android.dreams.basic.Colors
```
