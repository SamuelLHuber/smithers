#!/usr/bin/env bash
# Autonomous Smithers demo (terminal + macOS `say`).
#
# Defaults: full audio, presentation pacing.
#   ./.smithers/scripts/run-demo.sh
#
# Iterate on visuals without listening:
#   ./.smithers/scripts/run-demo.sh --silent
#
# Fast-forward through the whole demo (~30s):
#   ./.smithers/scripts/run-demo.sh --silent --speed 8
#
# Pick a different macOS voice:
#   ./.smithers/scripts/run-demo.sh --voice Daniel
#   say -v "?"   # list available voices
#
# All other flags get forwarded to `smithers up`.

set -euo pipefail

cd "$(dirname "$0")/../.."

silent=false
speed=1
voice="Ava (Premium)"
rate=195
forward=()

while (("$#")); do
  case "$1" in
    --silent) silent=true; shift ;;
    --speed)  speed=$2; shift 2 ;;
    --voice)  voice=$2; shift 2 ;;
    --rate)   rate=$2; shift 2 ;;
    *)        forward+=("$1"); shift ;;
  esac
done

input=$(printf '{"silent":%s,"speed":%s,"voice":"%s","rate":%s}' \
  "$silent" "$speed" "$voice" "$rate")

exec bun run smithers up .smithers/workflows/demo.tsx \
  --input "$input" "${forward[@]+"${forward[@]}"}"
