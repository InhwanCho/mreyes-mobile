#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [[ -d "$HOME/.bubblewrap/android_sdk" ]]; then
    export ANDROID_HOME="$HOME/.bubblewrap/android_sdk"
  else
    echo 'Set ANDROID_HOME to an installed Android SDK.' >&2
    exit 1
  fi
fi
if [[ -z "${JAVA_HOME:-}" && -x /usr/libexec/java_home ]]; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
fi
# Prefer SDK tooling over unrelated Python/Homebrew cmake wrappers.
if [[ -x "$ANDROID_HOME/cmake/3.22.1/bin/cmake" ]]; then
  export PATH="$ANDROID_HOME/cmake/3.22.1/bin:$PATH"
fi
export NODE_ENV=production
npm run check
npx expo prebuild --platform android --no-install
(
  cd android
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2
)
mkdir -p artifacts
cp android/app/build/outputs/apk/release/app-release.apk artifacts/mreyes-android-preview.apk
echo 'Created artifacts/mreyes-android-preview.apk (ARM64, test signing key; not for store submission).'
