#!/usr/bin/env bash
# Run both live Matrix-backend tests against the dev homeserver (must be up:
# `bun run matrix:up`). These need a real Synapse + Node 24, so they're kept out
# of the default `bun test` / turbo pipeline.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$DIR/infra/matrix/dev.env"

echo "== @munkel/matrix integration =="
(cd "$DIR/apps/matrix" && node --test --test-force-exit test/integration.test.ts)

echo "== @munkel/matrix-gateway e2e =="
(cd "$DIR/apps/matrix-gateway" && node --test --test-force-exit test/gateway.e2e.test.ts)

echo "== matrix-backend tests passed =="
