# Contributing

Thanks for looking at Munkel. The project is a Bun/Turborepo monorepo with a
Swift macOS app, a Bun-built CLI, a Cloudflare Worker relay, and a TanStack
Start landing page.

## Development setup

Requirements:

- Bun
- Xcode command line tools
- A `wrangler login` with access to the `limehq` account, only if you deploy
  Workers

```sh
bun install
bun run typecheck
bun run test
bun run build
```

Useful local commands:

```sh
bunx turbo dev --filter=@munkel/server     # relay on ws://127.0.0.1:8787
bunx turbo dev --filter=@munkel/landing    # landing on http://localhost:3000
cd apps/macos && bun run dev               # builds & runs the Munkel Dev app
```

The root `bun run dev` deliberately excludes the macOS app, which needs the
Swift toolchain; run the per-app command above for it. `cd apps/macos && bun
run dev` builds the **Munkel Dev** variant (a separate identity that runs side
by side with an installed release) and launches it. For a release-style local
bundle instead, run `cd apps/macos && ./make-bundle.sh release && open
.build/Munkel.app`. See [`README.md`](README.md) for the full development
workflow.

## Pull requests

- Keep changes scoped to one behavior or maintenance task.
- Add or update tests when behavior changes.
- Run `bun run typecheck` and `bun run test` before opening a PR.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`). Release
  Please uses those commits to maintain `CHANGELOG.md` and releases.

## Keeping documentation current

Documentation lives next to the code and is expected to match it. When a change
affects behavior, update the relevant docs in the same pull request:

- [`README.md`](README.md) — overview, install, security summary.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components and data flow.
- [`SECURITY.md`](SECURITY.md) — security model and reporting.
- [`PRIVACY.md`](PRIVACY.md) — what the relay can and cannot see.
- [`ROADMAP.md`](ROADMAP.md) — planned and in-progress work.
- Any other affected file (`GOVERNANCE.md`, `MAINTAINERS.md`, `RELEASING.md`,
  `docs/ACCESSIBILITY.md`, `docs/INTERNATIONALIZATION.md`, and so on).

Documentation that drifts from the code is treated as a bug: it is tracked in
the issue tracker and fixed like any other defect. Reviewers check that the
docs in a PR match the behavior it ships. CI runs `bun run typecheck` and
`bun run test` on every pull request, so keep both green alongside the docs.

## Security reports

Do not report vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).
