#!/usr/bin/env bash
# Queues an Android build on EAS unless the runtime already has a usable one (finished or in progress).
# Usage: ensure-android-build.sh <profile> <runtime> [force]
# Needs EXPO_TOKEN and EAS_PROJECT_ID in the environment and must run inside mobile/. Does not wait for the build.
set -euo pipefail

profile=${1:?profile}
runtime=${2:?runtime}
force=${3:-false}
tmp=${RUNNER_TEMP:-/tmp}
summary=${GITHUB_STEP_SUMMARY:-/dev/null}

# eas-cli prints notices before the JSON, so cut everything before the first bracket.
json='const s = require("fs").readFileSync(process.argv[1], "utf8"); const j = JSON.parse(s.slice(s.search(/[\[{]/)));'

eas build:list --platform android --build-profile "$profile" --runtime-version "$runtime" --limit 20 --json --non-interactive \
  > "$tmp/builds.json"
existing=$(node -p "$json j.filter(b => !['ERRORED', 'CANCELED'].includes(b.status)).map(b => b.status + ' ' + b.id)[0] ?? ''" "$tmp/builds.json")

if [ -n "$existing" ] && [ "$force" != "true" ]; then
  echo "Runtime \`$runtime\` already has an APK build (${existing}); installed apps on it get OTA updates. Nothing queued." >> "$summary"
  exit 0
fi

eas build --platform android --profile "$profile" --non-interactive --no-wait --json > "$tmp/build.json"
url=$(node -p "$json (Array.isArray(j) ? j[0] : j).buildDetailsPageUrl ?? ''" "$tmp/build.json")
{
  echo "### Android build queued ($profile)"
  echo
  echo "Runtime \`$runtime\`$([ -n "$existing" ] && echo " (forced; another build existed)" || echo " had no APK build, so installed apps cannot take its updates until you install the new one")."
  echo
  echo "${url:-See expo.dev → Builds}"
} >> "$summary"
