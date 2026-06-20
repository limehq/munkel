#!/usr/bin/env bash
# Stop the Munkel PoC homeserver. Pass --wipe to also delete the data dir
# (config, signing keys, database, media) for a clean SERVER_NAME reset.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

docker compose down

if [ "${1:-}" = "--wipe" ]; then
  echo "==> Wiping $DIR/data (config, keys, db, media)"
  # The data dir is owned by the container user; remove via a throwaway container.
  docker run --rm --user root -v "$DIR/data:/data" --entrypoint sh \
    "${MATRIX_SYNAPSE_IMAGE:-ghcr.io/element-hq/synapse:v1.151.0}" \
    -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null || true'
  rmdir "$DIR/data" 2>/dev/null || true
  echo "    wiped."
fi
