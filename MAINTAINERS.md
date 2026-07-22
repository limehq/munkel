# Maintainers

This file lists the people responsible for Munkel. Governance — how decisions
are made, how someone becomes a maintainer, and how continuity is guaranteed —
is described in [GOVERNANCE.md](GOVERNANCE.md).

## Current maintainers

| Name | Role | Contact | Areas of responsibility |
|---|---|---|---|
| Jurij Koch | Lead Maintainer | jurij@uq.dev | Final decision authority; releases (Release Please, signed/notarized build, Sparkle appcast); security coordination; accounts and keys (GitHub org, Cloudflare, Apple Developer ID, Sparkle signing key); overall direction across the macOS app, CLI, relay, and landing page. |
| Sebil Satici | Maintainer | hallo@sebil.dev | Pull-request review and merge; issue triage; releases; security triage; shares administrative and key access. |

Review and merge rights are enforced through the
**`@limehq/munkel-maintainers`** team referenced in
[.github/CODEOWNERS](.github/CODEOWNERS); membership of that team is the
authoritative record of who can approve and merge to `main`. The maintainers
listed above are the members of that team.

## Continuity

Both maintainers hold full administrative access to the `limehq` GitHub
organization and the `limehq/munkel` repository, access to the Cloudflare
account that runs the relay (`relay.munkel.app`), the landing page
(`munkel.app`), and the `munkel.app` DNS zone, and the Sparkle EdDSA appcast
signing key. As a result, **each maintainer can act alone** — creating and
closing issues, reviewing and merging pull requests, and cutting a full release
— **within one week** if the other is unavailable. The signing key and account
recovery codes are kept in offline backup outside any single machine, and
limehq (Unique (Deutschland) GmbH) is the legal backstop for the domain,
accounts, and the GitHub OAuth / application registrations. See
[GOVERNANCE.md](GOVERNANCE.md#continuity-and-succession) for the full policy.

## Security and conduct contacts

- **Security reports:** use GitHub private vulnerability reporting as described
  in [SECURITY.md](SECURITY.md). Both maintainers can receive and act on
  reports.
- **Code of Conduct:** maintainers enforce the
  [Code of Conduct](CODE_OF_CONDUCT.md); see it for how to raise a concern.

## Contributors

Munkel has also benefited from contributions by people who are not maintainers.
Thanks in particular to:

- Jasha Chec ([@devjasha](https://github.com/devjasha))

Contributions do not by themselves confer the maintainer role; see
[GOVERNANCE.md](GOVERNANCE.md#becoming-a-maintainer) for how maintainers are
added. The full contribution history is in the project's git log.
