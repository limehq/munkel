# Security Policy

## Supported versions

Security fixes target the latest released version. Before the first stable
release, fixes land on `main` and are included in the next release. Updates
reach installed apps through [Sparkle](https://sparkle-project.org) as
EdDSA-signed, notarized in-place updates; the Homebrew cask (`auto_updates
true`) defers to Sparkle.

## Reporting a vulnerability

Report privately through GitHub's security advisories:
https://github.com/limehq/munkel/security/advisories/new

If that is not available, open a public issue asking for a private contact
path, but do not include exploit details in the public issue.

Please include:

- Affected component: macOS app, CLI, relay, landing page, or release pipeline.
- Steps to reproduce or a proof of concept.
- Impact and any known mitigations.

We will acknowledge valid reports, investigate, and publish a fix or advisory
when appropriate. The maintainers who handle reports are listed in
[MAINTAINERS.md](MAINTAINERS.md).

## Security requirements — what you can and cannot expect

Munkel is built for ephemeral, lightweight messaging between friends, not
high-risk secret sharing. Be precise about its guarantees before trusting it
with anything sensitive.

### What you CAN expect

- **Payloads are encrypted on-device.** Message content is sealed with
  AES-256-GCM before it reaches the relay (`payload = base64(nonce[12] ‖
  ciphertext ‖ tag[16])`, random 12-byte nonce per message, empty AAD). The
  key is derived on-device via HKDF-SHA256 from the circle code, with salt
  `munkel-v1` and info `message-key` (32-byte key). See
  `apps/macos/Sources/MunkelKit/GroupKey.swift`,
  `apps/macos/Sources/MunkelKit/MessageCrypto.swift`, and the canonical wire
  spec `apps/server/src/protocol.ts`. AES-256-GCM was chosen for CryptoKit /
  WebCrypto interop; the Swift↔TypeScript derivation is pinned in
  `CryptoTests.swift`.
- **The relay stores no messages.** One Durable Object per circle
  (`idFromName(groupId)`) uses the WebSocket Hibernation API and persists no
  message data — messages are routed between live connections and never
  stored (`apps/server/src/group-room.ts`, `apps/server/src/protocol.ts`). The
  one persistence surface is full-resolution image blobs, which are stored as
  opaque ciphertext in R2 (`munkel-blobs`) under a short logical TTL (~66 s)
  and swept by a per-minute cron; the relay never holds the key
  (`apps/server/src/blob.ts`).
- **No accounts.** There is nothing to register, no password, and no server-
  side identity. A circle is born from a shared human-readable code
  (`blue-table-42`); the code never leaves the clients, and the relay only ever
  sees the derived `groupId`.
- **On-screen surfaces are excluded from screen capture.** Every window that
  shows message content or circle codes (notch panel, menu popover, command
  palette) is excluded from screen capture by setting `NSWindow.sharingType =
  .none`, applied by the `CaptureExclusion` view
  (`apps/macos/Sources/MunkelApp/CaptureExclusion.swift`). They stay visible on
  the physical display but are hidden from the legacy CoreGraphics path (the
  system screenshot tools and older recorders) and from ScreenCaptureKit on
  macOS ≤ 15.3. Known limitation: on macOS 15.4+ Apple changed display
  compositing so that ScreenCaptureKit full-display capture can ignore
  `sharingType = .none`, so exclusion is best-effort against modern SCK display
  recorders.
- **Ephemerality by design.** With no message history, no message persistence
  in the relay, and a short-TTL blob bucket, there is no chat log to leak; what
  you missed while offline is simply gone.

### What you CANNOT expect

- **No protection from anyone who has the circle code.** The circle code is a
  shared symmetric secret: every current circle member derives the same
  `messageKey`. Anyone who knows the code can read and send messages for that
  circle. Treat generated codes as convenience-grade secrets and use a longer
  custom code for more sensitive conversations.
- **No pairwise or forward-secret direct messages in v1.** Direct messages
  (`to`) are relay-targeted: the server enforces delivery to one member, but
  they are encrypted under the same shared circle key, not a pairwise key.
  Pairwise keys and forward secrecy are deliberately deferred to a later
  version (see `apps/server/src/protocol.ts` and [ROADMAP.md](ROADMAP.md)).
- **No cryptographic proof of identity from GitHub login.** "Sign in with
  GitHub" imports a display name and avatar only. It does not prove to peers
  that a member controls a given GitHub account; profiles are self-asserted,
  the same as a typed name. Presence status (Online / Do Not Disturb / Away) is
  likewise self-asserted — a member can broadcast any value.
- **No hiding metadata from the relay.** The relay necessarily observes
  connection metadata: derived group IDs, member IDs, connection timing,
  message sizes, and routing targets. It cannot read content, but it is not a
  metadata-private transport.
- **Not suitable for high-risk or anonymity threat models.** Munkel is not
  designed to defend against targeted or well-resourced adversaries, to
  anonymize you, or to protect against a compromised device. Do not use it
  where exposure carries serious personal, legal, or safety consequences.

## Threat model

The table below states which adversaries Munkel is designed to resist and how,
followed by adversaries that are explicitly out of scope.

### In scope

| Adversary | Mitigation |
|---|---|
| **Passive network or relay observer** (anyone watching the wire or running the relay) | Payloads are end-to-end encrypted with AES-256-GCM on-device; the relay only sees the derived `groupId`, member IDs, sizes, and timing — never plaintext or the circle code. Image blobs in R2 are opaque ciphertext with a short TTL. |
| **Screen capture / screen sharing** (Zoom, Teams, screenshots, recorders) | Notch panel, menu popover, and command palette set `NSWindow.sharingType = .none` via `CaptureExclusion`, so message content and circle codes are hidden from captured frames while staying visible on the physical display. This is reliable on the legacy capture path and on ScreenCaptureKit through macOS 15.3; full-display SCK capture on macOS 15.4+ can bypass it. |
| **A malicious or curious circle member** | Limited by design: the message key is shared, so a member can read circle traffic. The relay enforces targeted delivery for direct messages, and there is no message history for a member to exfiltrate after the fact. To exclude someone, rotate to a new circle code. |
| **A lost or unlocked device** | No message history is stored and no GitHub token is persisted (the token is RAM-only and discarded after one profile fetch). What remains locally is settings in the `dev.uq.munkel` defaults domain — joined circle codes, member ID, display name, GitHub login, a downscaled avatar, and the chosen presence status; ephemerality limits what can be recovered from the device. |

### Out of scope

- **Nation-state or targeted attackers.** Munkel does not aim to resist
  well-resourced adversaries who can mount targeted attacks, traffic
  correlation, or coercion.
- **A compromised endpoint or OS.** If the macOS device, its keychain, the
  user account, or the operating system is compromised (malware, a hostile
  recorder that bypasses capture exclusion, a kernel exploit), Munkel's
  on-screen and on-device protections do not hold.
- **Supply-chain risks beyond our controls.** We sign and notarize releases
  (EdDSA via Sparkle), pin and review dependencies, and run CI security checks
  (CodeQL, OpenSSF Scorecard). Compromise of upstream toolchains, GitHub,
  Cloudflare, or Apple infrastructure is outside what this project can
  guarantee.

## Credential & password storage

The project's sites do **not** store passwords for authenticating external
users, because there are no external user accounts anywhere in Munkel:

- **Website (munkel.app).** The landing page (`apps/landing/`) is a static
  marketing site served by a Cloudflare Worker. It has no login form, no user
  accounts, and no password storage.
- **GitHub repository (github.com/limehq/munkel).** Authentication and access
  control are GitHub's; the repository does not run its own user-auth system
  and stores no passwords.
- **Download URLs and the relay.** Releases are served from GitHub Releases and
  the Homebrew tap; the relay (`relay.munkel.app`) routes WebSocket traffic by
  derived `groupId` with no login. None of these authenticate external users
  with passwords.
- **GitHub sign-in.** "Sign in with GitHub" in the macOS app uses the GitHub
  OAuth device flow with empty scope. The access token is used once to fetch
  `GET /user`, kept in memory only (an ephemeral `URLSession`), and then
  discarded — it is never written to disk
  (`apps/macos/Sources/MunkelKit/GitHubDeviceAuth.swift`). The app stores only
  a display name and a downscaled avatar locally; no password or token is
  retained.

Because no project site stores passwords for authenticating external users, the
OpenSSF Best Practices `sites_password_security` criterion is **Not
Applicable** to Munkel.
