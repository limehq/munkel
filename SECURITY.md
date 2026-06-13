# Security Policy

## Supported versions

Security fixes target the latest released version. Before the first stable
release, fixes land on `main` and are included in the next release.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository. If that is not
available, open a public issue asking for a private contact path, but do not
include exploit details in the public issue.

Please include:

- Affected component: macOS app, CLI, relay, landing page, or release pipeline.
- Steps to reproduce or a proof of concept.
- Impact and any known mitigations.

We will acknowledge valid reports, investigate, and publish a fix or advisory
when appropriate.

## Security model

Munkel is built for ephemeral, lightweight messaging:

- The relay stores no message history.
- Payloads are encrypted on-device before they reach the relay.
- The relay still sees metadata: derived group IDs, member IDs, connection
  timing, message size, and routing targets.
- Generated group codes are convenience-grade shared secrets. Use longer custom
  codes for more sensitive conversations until the invite format is hardened.
- Direct messages in v1 are relay-targeted, not pairwise encrypted.

