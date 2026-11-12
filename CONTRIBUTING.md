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

### Local working files

Some artifacts are useful while a piece of work is open but do not belong in
history, so `.gitignore` keeps them out rather than leaving them to clutter
`git status` indefinitely:

- `scratchpad/` — drafts, measurement logs, throwaway scripts.
- `Debugging/` — notes written alongside a live investigation. Once a finding
  matters beyond the session it goes into the issue, the PR, or `docs/bugs/`.
- `*-export-session_*.md` — verbatim transcripts of delegated sub-agent runs.
  Worth keeping locally while the work is open; too large and too duplicative of
  the documentation to carry in the repository.

The rule behind all three: a file is ignored when its value expires with the
task. Anything meant to outlive the task belongs in a durable artifact instead —
an issue, a pull request, or a document under `docs/`.

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

### Landing preview CI

The `Deploy Landing Preview` workflow (`.github/workflows/deploy-landing-preview.yml`)
runs only when a pull request's diff touches `apps/landing/**` or that workflow
file. It is not triggered by root lockfile or turbo config changes alone, so
long-lived branches that rarely touch landing do not accumulate a permanent red
check from preview deploy.

Preview upload needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for the
`limehq` Cloudflare account. Repositories without those secrets still build
landing in CI; upload and the preview URL comment are skipped instead of failing
the job. Production deploy on `main` (`.github/workflows/deploy-landing.yml`) is
unchanged and still requires credentials.

## Security reports

Do not report vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).
