# Contributing

Thanks for looking at Munkel. The project is a Bun/Turborepo monorepo with a
Swift macOS app, a Bun-built CLI, a Cloudflare Worker relay, and a TanStack
Start landing page.

## Development setup

Requirements:

- Bun
- Xcode command line tools
- Wrangler login only if you deploy Workers

```sh
bun install
bun run typecheck
bun run test
bun run build
```

Useful local commands:

```sh
bunx turbo dev --filter=@munkel/server
bunx turbo dev --filter=@munkel/landing
cd apps/macos && ./make-bundle.sh && open .build/Munkel.app
```

## Pull requests

- Keep changes scoped to one behavior or maintenance task.
- Add or update tests when behavior changes.
- Run `bun run typecheck` and `bun run test` before opening a PR.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`). Release
  Please uses those commits to maintain `CHANGELOG.md` and releases.

## Security reports

Do not report vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).

