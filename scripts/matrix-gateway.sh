#!/usr/bin/env bash
# Start the Munkel->Matrix gateway against the local dev homeserver.
# Runs on Node 24 (rust-crypto WASM). Point the app/CLI at it with
#   MUNKEL_RELAY_URL=ws://localhost:${PORT:-8787}
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$DIR/infra/matrix/dev.env"
export PORT="${PORT:-8787}"
exec node "$DIR/apps/matrix-gateway/src/index.ts"
