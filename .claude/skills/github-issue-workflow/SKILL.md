---
name: github-issue-workflow
description: How to start work on a GitHub issue in the munkel repo — check for an existing draft PR and the issue's assignee first to avoid duplicating work someone already owns, claim the issue by assigning it, then open a draft PR linked with "Closes #N" so ownership and in-flight work are visible to everyone. Use whenever asked to work on, start, pick up, take, or implement a GitHub issue (e.g. "arbeite an Issue #N", "work on issue 42", "pick up #99").
metadata:
  internal: true
---

# Starting work on a GitHub issue

One issue → one owner → one draft PR, linked both ways. The point is that
ownership and in-flight work are visible to everyone from the moment work
starts, so two people never unknowingly build the same thing.

## 1. Before starting: is it already taken?

Never open a second branch or PR for an issue someone already owns. Check first:

```sh
gh issue view N                                              # assignee + linked PRs
gh pr list --state open --search "N in:body" \
  --json number,title,isDraft,url,headRefName
```

If the issue is already assigned, or an open PR (draft or not) already
references it, it is taken. **Stop** — report what you found and coordinate with
the owner, or pick a different issue. Do not start parallel work.

## 2. Claim the issue

Assignment is the ownership signal:

```sh
gh issue edit N --add-assignee @me      # or the relevant GitHub login
```

## 3. Set up an isolated worktree, then open a draft PR immediately

Work in a dedicated **git worktree**, never the shared root checkout: another
Claude session may drive this checkout concurrently, and a stray `checkout`
between two of your commands silently moves HEAD — your commit then lands on
`main` instead of your branch. Branching from a freshly fetched `origin/main`
into a new worktree also gives you a clean, up-to-date starting point in one move.

Open the PR *before* the work is finished, so the issue↔PR link exists from the
start. GitHub needs at least one commit on the branch to open a PR:

```sh
git fetch origin
git branch <type>/<short-slug> origin/main                            # feat/ fix/ docs/ chore/ refactor/
git worktree add .claude/worktrees/<type>+<slug> <type>/<short-slug>  # slug = branch with / → +
cd .claude/worktrees/<type>+<slug>   # stay here: run all edits, git, and builds from inside

git commit --allow-empty -m "chore: start #N"     # or your first real commit
git push -u origin <type>/<short-slug>
gh pr create --draft --base main \
  --title "<type>: <summary>" \
  --body "Closes #N"
```

`Closes #N` (also `Fixes`/`Resolves`) links the PR under the issue's
**Development** section and auto-closes the issue when the PR merges.

## 4. Work, then mark ready

Push commits as usual while in draft. Flip the PR out of draft only once it is
genuinely reviewable:

```sh
gh pr ready <PR>
```

## Notes

- **`cd` into the worktree and run *every* command — edits, `git`, builds — from
  inside it.** A worktree isolates you only while your shell's working directory is
  actually in it: driving it from the shared root with `git -C` or absolute paths
  defeats the purpose, and one stray `cd` away (e.g. for an unrelated call) silently
  puts your next commit on the root's shared HEAD. If something sends you back, `cd`
  in again before the next `git`. After the PR merges, drop the worktree with
  `git worktree remove .claude/worktrees/<type>+<slug>` (`.claude/worktrees/` is
  gitignored).
- Branch from `main`. This repo **squash-merges**, so intermediate commits on the
  branch never reach `main` history — the PR title becomes the squash commit.
- Use Conventional Commit types for both the branch prefix and the PR title
  (`feat`, `fix`, `docs`, `chore`, `refactor`); Release Please reads them.
- No co-author/attribution trailers in commits (house style).
