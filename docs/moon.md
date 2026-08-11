# Moon (experimental build orchestration)

[moon](https://moonrepo.dev) is a task runner / build orchestrator we are
**experimenting** with as a possible replacement for the hand-generated CircleCI
per-package jobs. It understands the pnpm package graph, caches task outputs
(locally and in a shared remote cache), and only re-runs work whose inputs
changed.

## Moon is optional

**You do not need moon installed to develop in this repo or to build for
production.** Everything works exactly as before without it:

- Normal development (`pnpm install`, `pnpm --filter … build`, `pnpm test:run`,
  dev servers) does not touch moon.
- The production build path does not use moon.
- Husky / lint-staged pre-commit hooks do not invoke moon.
- The required CI checks (the ~60 per-package jobs, `validate-monorepo`,
  `shellcheck`, rust) do not use moon.

Moon only runs inside its own dedicated, **non-blocking** `moon-ci` job, and
only on branches whose name contains `moon` — so other PRs and `main` never run
it. That job installs moon itself (only if it isn't already present). The moon
config files (`.moon/`, the per-project `moon.yml` files, `.prototools`) are
inert unless you run `moon` yourself.

If you want to run the moon task graph locally (to reproduce a `moon-ci`
failure, or to try the caching), read on.

## Installing moon locally

Pin the same version CI uses so behavior matches. The current version is in
`libs/monorepo-utils/src/circleci.ts` (`MOON_VERSION`) — at the time of writing
**2.4.6**.

### Option A: proto (recommended)

moon is made by the same team as [proto](https://moonrepo.dev/proto), a
toolchain version manager, and this repo already carries a `.prototools` file
pinning `nodejs` and `pnpm` to the exact versions in `.node-version` /
`packageManager`. Installing moon via proto keeps everything in one manager:

```sh
# install proto itself (one-time)
curl -fsSL https://moonrepo.dev/install/proto.sh | bash

# install the pinned moon version
proto install moon 2.4.6
```

You can also add a `moon` pin to `.prototools` locally if you want `proto use`
to manage it, but we intentionally do **not** commit a moon pin there — moon is
opt-in, and pinning it would imply everyone needs it.

Note that moon's own toolchain config (`.moon/toolchains.yml`) reads node and
pnpm versions **from `.prototools`** (`versionFromPrototools`). So when moon
runs a task it provisions the same node/pnpm the rest of the repo expects — you
don't get a second, drifting toolchain.

### Option B: the standalone install script

If you'd rather not use proto:

```sh
curl -fsSL https://moonrepo.dev/install/moon.sh | MOON_VERSION=2.4.6 bash
echo 'export PATH="$HOME/.moon/bin:$PATH"' >> ~/.bashrc   # or your shell rc
```

This is exactly what the CI jobs do.

## Using moon locally

Run from the repo root.

```sh
# run the full affected task graph the way CI does (build + test + lint +
# type-check for everything wired into .moon/workspace.yml)
moon ci

# run a single task for a single project (project ids are the keys in
# .moon/workspace.yml, e.g. `auth`, `admin-backend`, `admin-frontend`)
moon run auth:test
moon run admin-backend:build

# run a task across all projects
moon run :lint

# see what moon thinks is affected / cached without running
moon check auth
```

### Concurrency knobs (important)

Total worker threads under moon are roughly
`MOON_CONCURRENCY × per-task-workers`, and both vitest and cargo otherwise
auto-size to all cores — so without limits, N concurrent suites × cores each
oversubscribes the CPU and flakes timing-sensitive tests. Two knobs are
committed (they travel with the repo); the outer one is per-environment:

- `vitest run --maxWorkers=2` — committed in `.moon/tasks/typescript.yml`.
- `CARGO_BUILD_JOBS` — committed as env on each native Rust build task.
- `MOON_CONCURRENCY` — **you set this**; moon 2.4.6 has no committable setting.
  Use roughly **cores / 2**, e.g. on a 16-core dev machine:

  ```sh
  MOON_CONCURRENCY=8 moon ci
  ```

See [`MOON_NOTES.md`](../MOON_NOTES.md) for the full reasoning and the CircleCI
`nproc` gotcha (the Docker executor reports host cores, not the resource-class
limit).

### The remote cache

Task outputs can be shared through a remote cache (bazel-remote, S3-backed). It
is **env-gated**: moon only uses it when `MOON_REMOTE_HOST` is set (the
`remote:` block in `.moon/workspace.yml` is host-less on purpose, so it is off
by default). Local runs work fine without it — you just get local caching only.
Don't put the cache host or any AWS credentials into a committed file.

## How the moon jobs are wired into CI

The CircleCI config is **generated** — never edit `.circleci/config.yml` by
hand. Edit `libs/monorepo-utils/src/circleci.ts` and regenerate:

```sh
pnpm -w generate-circleci-config
```

The moon job is added to the full config as a **non-blocking addition** we can
watch and learn from while the existing per-package jobs keep gating PRs:

- **`moon-ci`** — the required-style lane (build/test/lint/type-check), sharded
  across 3 containers (`--job/--job-total`). Sharding is positional, so it is
  only sound _with_ the remote cache (a shard may be assigned a test whose
  dependency built on another shard; it hydrates that from the cache instead of
  rebuilding).

> The per-app `moon-e2e-*` Playwright jobs were removed — the moon variants of
> the e2e suites weren't stable enough to be worth running while we're not
> focusing on CI. The apps' integration-testing moon projects stay wired (their
> `test` task is `runInCI: false`, so `moon ci` skips them); re-add per-app jobs
> in `circleci.ts` if that path is worth revisiting.

Two properties keep it cheap and unobtrusive while the integration is young:

- **It only runs on `moon`-named branches.** The `moon-ci` job carries a
  `branches: only: /.*moon.*/` filter, so it runs on branches whose name
  contains `moon` (e.g. `moon-experiment`) and nowhere else — no cost added to
  other PRs or to `main`. The filter lives in `MOON_BRANCH_FILTER` in
  `circleci.ts`; widen it (or drop it) when moon graduates from experiment.
- **It installs moon only if it isn't already present.** The "Install moon" step
  is `if command -v moon; then …; else curl … | bash; fi`, so it installs the
  pinned version itself today but becomes a no-op the day moon is baked into the
  CI image or provided via proto.

### Generator knobs

- **`MOON_CI_PROTOTYPE`** — an environment variable read by
  `bin/generate-circleci-config`. Emits a slim config containing _only_ the
  `moon-ci` job (skips the ~60 per-package jobs). Useful for fast iteration on
  moon config without waiting for the whole suite. Regenerate without it to
  restore the full config:

  ```sh
  MOON_CI_PROTOTYPE=1 pnpm -w generate-circleci-config
  ```

The `moon`-branch filter is not a knob — it is always applied (see
`MOON_BRANCH_FILTER` above). To run the moon jobs on more branches, change that
constant and regenerate.

> The `moon-ci` job must be marked **non-required** in the GitHub
> branch-protection settings, or it'll block PRs despite being experimental.

## Diagnosing moon CI failures

- **Read the per-task logs.** The `moon-ci` job uploads
  `.moon/cache/states/<project>/<task>/` as the `moon-task-logs` artifact, and
  echoes any failed task's captured stdout/stderr to the end of the `moon ci`
  step. Start there — moon's summary only names the failing target.
- **Test results.** JUnit is collected via `store_test_results`, so failures
  show up in the CircleCI "Tests" tab for tasks that actually ran. Cached tasks
  don't re-report (they passed unchanged).
- **"No tasks found" running an e2e task.** The integration-testing `test` tasks
  are `runInCI: false`, and moon honors that in any CI environment (it detects
  CI via the `CI`/`CI_NAME`/`AZURE_PIPELINES` env vars). To run one anyway —
  locally under a CI-like env, or if you re-add an e2e job — use
  `env -u CI moon run …` to unset the flag; moon 2.4.6 has no
  `--ignore-ci-checks`.
- **Remote cache silently off.** moon rewrites `grpc://` → `http://` and rejects
  a malformed URI — a stray char/newline in `MOON_REMOTE_HOST` disables the
  cache silently. The job trims and echoes `host=[…]` so you can eyeball it; if
  everything is rebuilding from scratch, check that line.
- **A cache hit restores `build/` but the run still fails on a missing file.**
  Anything a task produces that a downstream task needs must be declared in that
  task's `outputs`, or a cache hit won't restore it. This bit us with the
  `pdictl` Rust binary (see `libs/pdi-scanner/moon.yml`) and the
  `tsconfig.build.tsbuildinfo` incremental-state file (see
  `.moon/tasks/typescript.yml`).
- **Concurrent packages clobbering each other.** moon runs many packages' tests
  in one worktree at once. Anything writing to a shared path must be namespaced
  by `MOON_PROJECT_ID` (moon sets it per task; subprocesses inherit it) — see
  `getMockStateRootDir` in `libs/utils/src/mocking.ts`. Symptoms are `ENOTEMPTY`
  / wrong-count flakes that never reproduce under the isolated per-package CI.
- **Reproduce locally.** `MOON_CONCURRENCY=<cores/2> moon ci` runs the same
  graph. To force a task to re-run ignoring the cache:
  `moon run <proj>:<task> --force` (or clear `.moon/cache`).
