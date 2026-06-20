# Munkel PoC dev homeserver

A closed, single-server **Matrix (Synapse) island** for developing the Matrix
backend spike. It is a throwaway, loopback-bound homeserver — **not** a
production setup. See [`docs/adr/0001-matrix-backend-spike.md`](../../docs/adr/0001-matrix-backend-spike.md)
for the why.

- Image: `ghcr.io/element-hq/synapse:v1.151.0` (pinned in `dev.env`).
- `server_name`: `munkel.localhost`.
- Client API: `http://localhost:8008` — **loopback only, no TLS, no federation.**
- Database: SQLite, in a host bind-mount at `./data` (gitignored).

The closed-island posture is enforced in [`munkel-override.yaml`](munkel-override.yaml):
no federation listener, `federation_domain_whitelist: []`, `trusted_key_servers: []`,
public room signup off (we provision via the admin API), and near-ephemeral
retention. Nothing inbound from the network can reach it.

## Prerequisites

- **Docker** with Compose (any recent Docker Desktop / Engine).
- `curl` and `python3` on the host (the scripts use them for health checks and
  the shared-secret HMAC). Both ship with macOS.

No Node/Bun is needed to run the homeserver itself — that is only for the gateway
and clients.

## Usage

All scripts are idempotent and take no required arguments. Run them from the repo
root.

### Bring it up

```bash
bash infra/matrix/scripts/up.sh
```

First run: creates `./data`, runs the one-shot Synapse `generate`
(`SERVER_NAME=munkel.localhost`), **deep-merges** `munkel-override.yaml` into the
generated `homeserver.yaml`, starts Synapse, and polls until
`GET http://localhost:8008/_matrix/client/versions` returns 200. Subsequent runs
just start the existing container.

It prints the base URL, the negotiated client-server versions, and the
`MUNKEL_RELAY_URL` to point clients at the gateway.

### Tear it down

```bash
bash infra/matrix/scripts/down.sh          # stop the container, keep ./data
bash infra/matrix/scripts/down.sh --wipe   # stop AND delete ./data (config, keys, db, media)
```

Use `--wipe` for a clean reset (e.g. to change `SERVER_NAME`). The data dir is
owned by the container user, so `--wipe` removes it via a throwaway container
rather than host `rm`.

### Smoke-test provisioning

```bash
bash infra/matrix/scripts/register-user.sh <username> <password> [admin]
```

Exercises the **same shared-secret HMAC register flow the gateway uses** to
auto-provision per-install users (one `GET` for a nonce, one HMAC-SHA1-signed
`POST`). Prints the new MXID, device id, and a truncated access token. Pass
`admin` as the third argument to create an admin user. Example:

```bash
bash infra/matrix/scripts/register-user.sh smoke smokepass
```

## Operational caveats — read these

### `SERVER_NAME` is permanent

`munkel.localhost` is baked into the signing keys and **every** Matrix ID the
moment `generate` runs. You **cannot** change it on a live volume. To change it,
`down.sh --wipe` and bring it up fresh. `up.sh` sets it from the first `generate`
and never changes it.

### Keep MAS / MSC3861 **OFF**

Provisioning and login here rely on Synapse's **shared-secret register API** and
`m.login.password`. If you ever enable the Matrix Authentication Service
(MSC3861 / delegated auth), **that password path breaks silently** — registration
and login start failing because Synapse hands auth off to MAS. The override file
deliberately leaves MAS disabled. Do not turn it on for this PoC. (The production
successor is an Application Service, not MAS — see the ADR.)

### Ephemerality is near-ephemeral, **NOT zero**

Retention in `munkel-override.yaml` is the most ephemeral Synapse can honestly do,
but there is a **floor of a few minutes**, and some state never goes away:

- `max_lifetime: 10m` marks messages purge-eligible, but **purge runs on a job
  interval** (`purge_jobs interval: 5m`) — deletion is periodic, not immediate.
- `history_visibility: joined` means a newcomer sees **no backfill** before they
  joined (this is what preserves Munkel's "offline means missed").
- **Room state events** (membership, name, topic) are **never purged** by
  retention, and Synapse always keeps the **most recent message per room** so it
  has a valid forward-extremity.

In short: expect **~minutes of message retention**, and the **membership graph +
last message per room persist** on the homeserver until the room is forgotten
(`forgotten_room_retention_period: 1h`). Communicate this honestly — it is a real
weakening of "no history anywhere".

### Dev secrets are committed **on purpose**

`dev.env` and `munkel-override.yaml` contain `registration_shared_secret`, the
password pepper, etc., with `-change-me` values. They are committed deliberately:
this is a throwaway, loopback-bound homeserver and the secrets only ever protect a
local dev island. **Never reuse these values anywhere real.** A production
homeserver gets fresh secrets and does not commit them.

## Pointing the app / CLI at the gateway

The clients never talk to Synapse directly — they talk to the
**`@munkel/matrix-gateway`** WebSocket gateway, which bridges Munkel's ws protocol
(and the same-origin `/blob/<group>/<key>` endpoint) to Matrix.

1. Start Synapse (above).
2. Start the gateway on **Node 24** (the Megolm/WASM crypto path is verified on
   Node, not Bun), sourcing the dev secrets:

   ```bash
   source infra/matrix/dev.env
   PORT=8787 node apps/matrix-gateway/dist/index.js
   # uses MATRIX_BASE_URL, MATRIX_SERVER_NAME,
   # MATRIX_REGISTRATION_SHARED_SECRET, MATRIX_PW_PEPPER from dev.env
   ```

   Confirm `GET http://localhost:8787/health` → 200.
3. Point the **unchanged** clients at the gateway via the relay override:

   ```bash
   # CLI
   MUNKEL_RELAY_URL=ws://localhost:8787 bun apps/cli/src/munkel.ts ...

   # macOS app (AppModel reads MUNKEL_RELAY_URL as relayURLOverride)
   MUNKEL_RELAY_URL=ws://localhost:8787 open -a Munkel
   ```

Two clients joined to the **same circle code** then exchange messages (and images)
over Matrix with no client change.
