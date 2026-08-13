# Building and testing with Turborepo

Task orchestration and caching in this monorepo are handled by
[Turborepo](https://turborepo.com) (`turbo.json` at the repo root). Turbo
derives task order from the pnpm workspace dependency graph, runs independent
tasks in parallel, and caches results so unchanged work is never repeated.

This is the practical guide. The task wiring and caching rules are also
summarized in [CLAUDE.md](../CLAUDE.md#turborepo).

## Everyday commands

From the repo root, operating on all packages:

```sh
pnpm build        # build everything (turbo run build:self)
pnpm type-check   # type-check everything
pnpm lint         # lint everything
pnpm test         # run all unit tests
pnpm clean        # remove build outputs
```

Scoped to one package (and its dependencies, built from cache when possible):

```sh
pnpm --filter @votingworks/<pkg> build
turbo run build:self --filter=@votingworks/<pkg>   # equivalent
```

Working inside a single package directory, use its own scripts — these bypass
turbo:

```sh
pnpm build:self   # build just this package (assumes deps are already built)
pnpm test:run     # run this package's tests once (never watch mode)
pnpm lint
```

Run an app's dev servers (frontend + backend) with `pnpm start` from the app's
frontend directory. This uses `turbo watch`, so editing a shared library
rebuilds it and restarts the backend automatically.

## Caching, including across worktrees

A cache hit replays a task's logs and restores its outputs instead of re-running
it — you'll see `cache hit, replaying logs` and, for a fully-cached run,
`>>> FULL TURBO`.

Turbo shares one local cache across all git worktrees of this repo (it lives
under the shared `.git` directory, not inside any single worktree). So a package
you built in one worktree is restored for free in another. Two things to know:

- The cache is **per-machine** — it is not shared between developers or with CI.
  A fresh checkout of a commit nobody on this machine has built yet gets few
  hits; the speed-up is on rebuilds of commits you've already built.
- The cache is **unbounded** — it grows over time and is never auto-evicted.

## Troubleshooting

### Force a rebuild (ignore the cache for one run)

If you suspect a stale cache, re-run the task with `--force` (writes fresh
results back to the cache):

```sh
turbo run build:self --filter=@votingworks/<pkg> --force
# or, for a whole root script:
TURBO_FORCE=true pnpm build
```

### Read-only or no cache for one run

```sh
turbo run test:run:self --filter=@votingworks/<pkg> --cache=local:r   # read but don't write
turbo run test:run:self --filter=@votingworks/<pkg> --cache=          # ignore cache entirely
```

### Clear the on-disk cache

There is no `turbo cache clean` command, and `rm -rf .turbo` in your worktree
does **not** clear cached artifacts — the worktree's `.turbo/` only holds run
summaries. The artifact cache is the shared directory next to the repo's git
common dir. Locate and delete it with:

```sh
rm -rf "$(git rev-parse --git-common-dir)/../.turbo/cache"
```

(For a normal, non-worktree checkout this is just `.git/../.turbo`, i.e. next to
your repo.)

`pnpm -w clean-all` also removes the cache, but note it runs `git clean -dfX`
first, which deletes **all** git-ignored files — `node_modules`, every `build/`,
etc. — so you'll need a fresh `pnpm install` and rebuild afterward.

### Reset a package's build outputs

Use the package's `clean` script rather than deleting `build/` by hand:

```sh
pnpm --filter @votingworks/<pkg> run clean:self   # rm -rf build + tsc --build --clean
```

`rm -rf build` is also safe on its own — the incremental `tsc` build-info lives
inside `build/`, so deleting the directory fully resets the package.

### A cache hit looks wrong

A cache hit is a result you didn't recompute. If turbo restores something that
seems stale, first confirm with a `--force` run: if `--force` produces different
output, the task is missing a declared input or `env` in `turbo.json` (that's a
cache-correctness bug to fix, not just a local glitch). If `--force` matches,
the cache was fine.
