#!/usr/bin/env bash
# Bring up the Munkel PoC dev homeserver. First run: generate config + signing
# keys, deep-merge our overrides, then start. Subsequent runs: just start.
# Idempotent. Usage: bash infra/matrix/scripts/up.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
# shellcheck disable=SC1091
source "$DIR/dev.env"

IMAGE="$MATRIX_SYNAPSE_IMAGE"
SERVER_NAME="$MATRIX_SERVER_NAME"
DATA_DIR="$DIR/data"

mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/homeserver.yaml" ]; then
  echo "==> Generating homeserver.yaml (SERVER_NAME=$SERVER_NAME) — this is permanent for this volume"
  docker run --rm \
    -v "$DATA_DIR:/data" \
    -e SYNAPSE_SERVER_NAME="$SERVER_NAME" \
    -e SYNAPSE_REPORT_STATS=no \
    "$IMAGE" generate

  echo "==> Merging Munkel overrides into homeserver.yaml"
  # -i keeps stdin open so `python3 -` actually reads the heredoc below.
  # The shared secret is injected from dev.env (single source of truth) rather
  # than duplicated in the override file.
  docker run --rm -i --user root \
    -v "$DATA_DIR:/data" \
    -v "$DIR/munkel-override.yaml:/override.yaml:ro" \
    -e INJECT_SHARED_SECRET="$MATRIX_REGISTRATION_SHARED_SECRET" \
    --entrypoint python3 "$IMAGE" - <<'PY'
import os, yaml
base = yaml.safe_load(open("/data/homeserver.yaml"))
over = yaml.safe_load(open("/override.yaml"))
def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        else:
            a[k] = v
merge(base, over)
base["registration_shared_secret"] = os.environ["INJECT_SHARED_SECRET"]
yaml.safe_dump(base, open("/data/homeserver.yaml", "w"), sort_keys=False, default_flow_style=False)
os.chmod("/data/homeserver.yaml", 0o644)
print("    merged %d override keys + injected shared secret" % len(over))
PY

  if ! grep -qF "$MATRIX_REGISTRATION_SHARED_SECRET" "$DATA_DIR/homeserver.yaml"; then
    echo "ERROR: override merge did not apply (shared secret missing from homeserver.yaml)" >&2
    exit 1
  fi
else
  echo "==> homeserver.yaml already present — reusing it (run down.sh --wipe to reset)"
fi

echo "==> Starting Synapse"
docker compose up -d

echo -n "==> Waiting for the client-server API"
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:8008/health" >/dev/null 2>&1 \
    && curl -fsS "http://localhost:8008/_matrix/client/versions" >/dev/null 2>&1; then
    echo " — up."
    echo
    echo "Homeserver ready:  $MATRIX_BASE_URL   (server_name: $SERVER_NAME)"
    echo "Versions:          $(curl -fsS http://localhost:8008/_matrix/client/versions | python3 -c 'import sys,json;print(",".join(json.load(sys.stdin)["versions"][-3:]))')"
    echo "Point the app/CLI: MUNKEL_RELAY_URL=ws://localhost:8787 (after starting the gateway)"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo
echo "ERROR: Synapse did not come up in time. Logs:" >&2
docker compose logs --tail=40 synapse >&2
exit 1
