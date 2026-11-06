# Luna 0.4.1

Luna is a fullscreen home screen and ambient-sky projector app for Android TV. Its home row launches featured apps; **All Apps** lists apps available on the device, and **Home Apps** lets you choose which appear on the home row. The system menu opens Android Settings, Wi-Fi, Inputs, Spotify Controls, All Apps, and the stock launcher exit where supported by the device.

The animated sky is built from local artwork, layered CSS effects, and a WebGL cloud renderer. Motion and rendering load vary with device and browser; frame rate is not guaranteed and older projector hardware may show reduced detail or dropped frames. The web app can also run in a desktop browser as a UI demo. Native Android actions require the Android wrapper.

## Controls

- Arrow keys, remote D-pad, or gamepad D-pad/left stick: move focus
- Enter, Space, or gamepad select: activate
- Escape, Backspace, or remote/gamepad Back: go back
- Pointer or touch: select visible controls

## Run in a browser

Requires Node.js and npm.

```sh
npm install
npm run dev
```

Vite serves the local app and static files from `public/`. The browser demo does not have Android's native app catalogue, system settings, input switching, or launcher integration.

## Check and build

```sh
npm test
npm run build
```

`npm test` runs the Node test suite after compiling its TypeScript modules. `npm run build` type-checks and creates the production web bundle in `dist/`.

## Android APKs

The Android project packages the `dist/` web bundle in a WebView. Build the web bundle first. With Docker installed, the helper builds the debug APK:

```sh
bash android/build-docker.sh
```

For a release APK, use the same Docker build environment after building the web bundle:

```sh
docker build --platform linux/amd64 -t luna-projector-android-build android
docker run --rm --platform linux/amd64 -v "$PWD:/workspace" -v luna-projector-gradle:/gradle -w /workspace/android luna-projector-android-build gradle --no-daemon --console=plain assembleRelease
```

The release variant is signed with Gradle's existing local debug signing key to preserve update compatibility with the corresponding installed Luna build. It is a locally signed build, not a Play Store production release. Keep that key available for future compatible updates.

## Static assets

Artwork and app marks are in `public/assets/`. The build excludes legacy cloudscape assets from the production bundle; the renderer loads only the assets used by the current sky composition. Android includes the resulting `dist/` bundle inside the APK, so runtime does not require a web server or network connection for Luna's interface and backgrounds.
