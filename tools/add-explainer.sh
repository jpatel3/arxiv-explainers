#!/usr/bin/env bash
# Thin wrapper so you can run ./tools/add-explainer.sh ...
# See `node tools/add-explainer.mjs --help` for full usage.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/add-explainer.mjs" "$@"
