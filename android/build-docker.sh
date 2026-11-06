#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="luna-projector-android-build"
VOLUME="luna-projector-gradle"

npm --prefix "$ROOT" run build
docker build --platform linux/amd64 -t "$IMAGE" "$ROOT/android"
docker run --rm --platform linux/amd64 --user "$(id -u):$(id -g)" \
  -v "$ROOT:/workspace" \
  -v "$VOLUME:/gradle" \
  -w /workspace/android \
  "$IMAGE" gradle --no-daemon --console=plain assembleDebug

echo "APK: $ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
