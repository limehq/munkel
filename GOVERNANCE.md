# Governance

This document describes how the Munkel project is run: who holds which role,
how decisions are made, how the project continues if a maintainer becomes
unavailable, and how this document itself changes.

## Overview

Munkel is a small open-source project under the [`limehq`](https://github.com/limehq)
GitHub organization, licensed under [MIT](LICENSE). It follows a
**lead-maintainer model with a co-maintainer**: a Lead Maintainer holds final
decision authority, and a second Maintainer shares day-to-day review, triage,
and release duties. Both maintainers hold full administrative and signing
access, so neither is a single point of failure.

limehq (legal entity: Unique (Deutschland) GmbH) is the **organizational and
legal backstop**. It owns the GitHub organization, the Cloudflare account that
hosts the relay and landing page and the `munkel.app` DNS zone, the
`munkel.app` domain registration, and the GitHub OAuth app registration. If the
individual maintainers were both unavailable, limehq retains the legal rights
needed to restore access and appoint new maintainers.

The current maintainers are listed in [MAINTAINERS.md](MAINTAINERS.md). Code
ownership and required review are enforced through the
`@limehq/munkel-maintainers` team referenced in
[.github/CODEOWNERS](.github/CODEOWNERS).

## Roles and responsibilities

The project defines four roles. The people currently holding the maintainer
roles are named in [MAINTAINERS.md](MAINTAINERS.md); membership of the
`@limehq/munkel-maintainers` CODEOWNERS team is the authoritative record of who
can approve and merge. (Other projects may record this differently; for Munkel
the source of truth is MAINTAINERS.md plus the `@limehq/munkel-maintainers`
team.)

### Lead Maintainer

Final decision authority for the project. Concretely, the Lead Maintainer:

- Has the final say on technical direction, scope, and disputed pull requests,
  and breaks ties when maintainers disagree.
- Owns the release process end to end (see [RELEASING.md](RELEASING.md)):
  cutting releases via Release Please, the signed/notarized desktop build, and
  the Sparkle auto-update feed.
- Coordinates security response: triaging private reports filed under
  [SECURITY.md](SECURITY.md), driving fixes, and publishing advisories.
- Is the primary holder of accounts and keys: the GitHub organization, the
  Cloudflare account (relay, landing, `munkel.app` DNS zone), the Apple
  Developer ID and notarization credentials, and the Sparkle EdDSA appcast
  signing key.
- Owns this governance document and the maintainer roster.

### Maintainer

A Maintainer shares the operational load and can act independently. Concretely,
a Maintainer:

- Reviews and merges pull requests, including approving on behalf of
  `@limehq/munkel-maintainers` to satisfy the required CODEOWNERS review.
- Triages issues: reproducing bugs, labeling, closing duplicates or
  out-of-scope requests, and asking for missing detail.
- Can cut a release independently following [RELEASING.md](RELEASING.md).
- Participates in security triage and remediation.
- Holds the same administrative and key access as the Lead Maintainer (see
  [Continuity and succession](#continuity-and-succession)), so the project does
  not stall when the Lead Maintainer is away.

### Contributor

Anyone who opens an issue or pull request. Contributors:

- Follow [CONTRIBUTING.md](CONTRIBUTING.md): scope changes narrowly, add or
  update tests when behavior changes, run `bun run typecheck` and `bun run test`
  before opening a PR, and use Conventional Commits.
- Have no merge rights; their changes are merged by a maintainer after review.
- Are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Contributors are credited in [MAINTAINERS.md](MAINTAINERS.md) and in the git
history; contribution does not by itself confer the maintainer role (see
[Becoming a maintainer](#becoming-a-maintainer)).

### Security contact

Security reports are not handled in public. The security contact is the
maintainer group, reachable through GitHub's private vulnerability reporting as
described in [SECURITY.md](SECURITY.md). Both maintainers can receive and act
on these reports, so a report is never blocked on one person. The Lead
Maintainer coordinates the overall response.

## Decision-making

Munkel uses lightweight, pull-request-driven decision-making:

- **Lazy consensus.** Most changes are proposed as pull requests or issues. A
  change proceeds once a maintainer approves it and no other maintainer has
  raised an unresolved objection. Silence is taken as assent.
- **Required review.** Every change to `main` requires review from
  `@limehq/munkel-maintainers` per [.github/CODEOWNERS](.github/CODEOWNERS).
  Approval from one maintainer satisfies this gate; either maintainer can
  provide it.
- **Tie-breaking.** If maintainers disagree and cannot reach consensus, the
  Lead Maintainer makes the final decision. This authority is used sparingly;
  the default is to discuss until agreement.
- **Escalation.** Disagreements are first worked out in the relevant issue or
  pull-request thread. If that does not resolve them, they are escalated to the
  Lead Maintainer. Matters touching accounts, legal rights, or the project's
  continued existence escalate to limehq as the organizational backstop.
- **Larger or contentious changes.** Significant or potentially controversial
  changes (security model, wire protocol, public API, governance) should be
  raised as an issue for discussion before a pull request, so maintainers can
  agree on direction before code is written.

### Changing this document

Changes to this `GOVERNANCE.md` and to [MAINTAINERS.md](MAINTAINERS.md) are made
by pull request and require approval from the Lead Maintainer (in addition to
the standard CODEOWNERS review). This keeps the project's rules and its roster
under the same review discipline as the code.

## Becoming a maintainer

There is no fixed quota. A contributor may be invited to become a Maintainer
after a sustained track record of high-quality contributions and reviews, good
judgment in discussions, and adherence to the [Code of Conduct](CODE_OF_CONDUCT.md).
The invitation is proposed by an existing maintainer and confirmed by the Lead
Maintainer. Onboarding a new maintainer means:

1. Adding them to the `@limehq/munkel-maintainers` team so CODEOWNERS review and
   merge rights apply.
2. Recording them in [MAINTAINERS.md](MAINTAINERS.md) with their role, contact,
   and areas of responsibility.
3. Granting the administrative and key access appropriate to the role, and
   ensuring the continuity guarantees below still hold.

Maintainers who step back are moved to an emeritus note in
[MAINTAINERS.md](MAINTAINERS.md), and their access is revoked.

## Continuity and succession

The project is designed to continue with minimal interruption if any single
person is lost. There is no resource that only one maintainer can reach.

**Shared administrative and key access.** Both maintainers hold:

- **Admin** on the `limehq` GitHub organization and the `limehq/munkel`
  repository, so either can create and close issues, accept pull requests,
  manage CI, and publish releases.
- Access to the **Cloudflare** account that runs the relay
  (`relay.munkel.app`), the landing page (`munkel.app`), and the `munkel.app`
  **DNS zone**, so either can deploy and operate the production services.
- The **Sparkle EdDSA appcast signing key**, so either can sign and ship an
  auto-update.

Because of this, **either maintainer can independently create or close issues,
accept and merge pull requests, and cut a full release within one week** if the
other is unavailable.

**Offline backups.** The Sparkle EdDSA signing key and account recovery codes
are backed up offline, outside any single maintainer's machine, so the loss of
one device does not lose irreplaceable credentials. The signing key in
particular is unrecoverable if lost and would break updates for users who have
not yet updated, so it is held by both maintainers and kept in offline backup.
(This document does not contain any key material or recovery codes; operational
locations are kept in a private operator note, as described in
[RELEASING.md](RELEASING.md).)

**Legal backstop.** limehq holds the legal rights to the `munkel.app` domain,
the DNS zone, the Cloudflare account, and the GitHub OAuth / application
registrations. If both individual maintainers were unavailable, limehq can
recover access to these resources and appoint new maintainers, so the project's
identity and infrastructure are not tied to any one individual.

## Bus factor

The project's **bus factor is 2 or greater**: there are two maintainers, and
*each* of them holds full administrative access to the GitHub organization and
repository, full access to the Cloudflare account (relay, landing, and DNS
zone), and the Sparkle signing key. Either one can run the entire project,
including issue management and releases, without the other.

What keeps the bus factor at 2 or more:

- Access is granted to the **role**, not held by one person — both maintainers
  carry the same admin and key access rather than splitting it.
- The Sparkle signing key and account recovery codes are kept in **offline
  backup** outside any single machine.
- **limehq** is the organizational/legal backstop for the domain, accounts, and
  app registrations.
- New maintainers are onboarded with the full access set
  (see [Becoming a maintainer](#becoming-a-maintainer)), so adding people
  raises the bus factor rather than fragmenting access.

## Code of Conduct

All participation in Munkel is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md). Maintainers are responsible for
enforcement and may edit, hide, or remove comments, lock conversations, or
block contributors to keep the project usable. Ordinary conduct concerns can be
raised by opening an issue asking a maintainer to review; conduct issues that
are security-sensitive or require privacy are reported through the private
channel in [SECURITY.md](SECURITY.md).

## Security

Vulnerabilities are reported privately, never in public issues. See
[SECURITY.md](SECURITY.md) for the reporting channel, what to include, and the
supported-versions policy. The maintainers coordinate triage and remediation as
described under [Roles and responsibilities](#roles-and-responsibilities).
