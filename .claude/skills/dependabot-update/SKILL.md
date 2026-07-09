---
name: dependabot-update
description:
  Handle Dependabot dependency-update PRs in this pnpm monorepo by redoing each
  upgrade with a clean lockfile. Use when asked to handle, process, or merge
  Dependabot PRs or dependency bumps.
---

# Dependabot Updates

Dependabot PRs here almost always fail CI because it regenerates the shared
`pnpm-lock.yaml` incorrectly — a typical symptom is nearly every test job
failing with an unrelated `Error: Cannot find module 'vite'`. **Don't try to fix
its branches.** Redo each upgrade cleanly on your own branch, then close the
Dependabot PR once yours merges.

Two things to know:

- Dependabot is configured with `open-pull-requests-limit: 0`
  (`.github/dependabot.yml`), so **every** open Dependabot PR is a _security_
  update that should be applied.
- There is one `pnpm-lock.yaml` at the repo root, but Dependabot opens one PR
  per manifest. Group the PRs by **advisory** (package + target version),
  ignoring which directory each targets — each advisory becomes one PR of ours.

## Workflow

List the open PRs with `gh pr list --author "app/dependabot"`. Then, for each
advisory, on a branch off the latest `main`:

1. Bump the version in **every** `package.json` that references the package:
   ```sh
   grep -rln '"<pkg>": "<old>"' --include=package.json apps libs | grep -v node_modules
   ```
2. Regenerate the lockfile with a clean `pnpm install` (not
   `--frozen-lockfile`). Confirm the diff is small and scoped: no unrelated
   entries, and no stray old-version references
   (`grep -c "<pkg>@<old>" pnpm-lock.yaml` → 0).
3. Verify:
   - `pnpm install --frozen-lockfile` passes — this is what CI runs, and it
     proves the lockfile is internally consistent.
   - Run one test suite in a package that uses the dependency
     (`pnpm test:run <file>`, never watch mode) so the failure mode is actually
     exercised.
4. Commit and open a draft PR using the repo template.

After our PR merges, close the superseded Dependabot PRs with a comment.

## Stacking (multiple advisories)

Every advisory edits the same `pnpm-lock.yaml`, so independent branches off
`main` conflict on merge. Stack them instead: branch the second advisory off the
**first advisory's branch**, run `pnpm install` there, and set the second PR's
base to the first branch. Merge in order, retargeting the second PR's base to
`main` after the first merges.
