#!/bin/sh
set -eu
origin_key="$1"
shift
origin_value="$(node "$(dirname "$0")/runtime-origin.mjs" "$origin_key")"
export "$origin_key=$origin_value"
exec "$@"
