#!/usr/bin/env bash
# Smoke-test the shared-secret HMAC register flow (the same flow the gateway uses
# to auto-provision per-install users). Prints the new user's MXID + access token.
# Usage: bash infra/matrix/scripts/register-user.sh <username> <password> [admin]
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$DIR/dev.env"

USER="${1:?usage: register-user.sh <username> <password> [admin]}"
PASS="${2:?usage: register-user.sh <username> <password> [admin]}"
ADMIN="${3:-notadmin}" # 'admin' or 'notadmin'

MATRIX_BASE_URL="$MATRIX_BASE_URL" \
MATRIX_REGISTRATION_SHARED_SECRET="$MATRIX_REGISTRATION_SHARED_SECRET" \
python3 - "$USER" "$PASS" "$ADMIN" <<'PY'
import hashlib, hmac, json, os, sys, urllib.request

base = os.environ["MATRIX_BASE_URL"]
secret = os.environ["MATRIX_REGISTRATION_SHARED_SECRET"].encode()
user, password, admin = sys.argv[1], sys.argv[2], sys.argv[3]

def call(method, body=None):
    req = urllib.request.Request(
        f"{base}/_synapse/admin/v1/register",
        data=json.dumps(body).encode() if body else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

nonce = call("GET")["nonce"]
mac = hmac.new(secret, digestmod=hashlib.sha1)
mac.update(nonce.encode()); mac.update(b"\x00")
mac.update(user.encode());  mac.update(b"\x00")
mac.update(password.encode()); mac.update(b"\x00")
mac.update(b"admin" if admin == "admin" else b"notadmin")
res = call("POST", {
    "nonce": nonce, "username": user, "password": password,
    "admin": admin == "admin", "mac": mac.hexdigest(),
})
print(json.dumps({"user_id": res["user_id"], "device_id": res["device_id"],
                  "access_token": res["access_token"][:12] + "…(truncated)"}, indent=2))
PY
