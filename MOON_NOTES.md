# Moon Notes

> For how to **install and use moon locally** and how to **diagnose the moon CI
> jobs**, see [`docs/moon.md`](./docs/moon.md). This file is the running
> experiment log / rationale.

## Discoveries

- Moon can manage toolchains, i.e. nodejs/npm/rust/cargo.
- Moon assumes a monorepo with workspace settings and per-project settings.
- Tasks seem to be defined in projects under a `tasks` config key.
- Use e.g. `deps: ['^:build']` to make a task depend on a parent's tasks, in
  this example the `build` task.
- Moon CAN automatically figure out monorepo node package graphs, despite
  Claude's claim based on its research. So we don't need to specify `dependsOn`
  for standard `package.json`-based dependencies.
- Moon can use globs to specify projects within a workspace, but it doesn't seem
  to be able to just look at the whole package graph from `pnpm`. I've had to
  specify each project name/path that I want included in the root
  `.moon/workspaces.yml` file.
- Moon can specify tasks at the workspace level that are inherited by projects,
  largely obviating the need to specify per-project tasks.
- Specifying `inputs` and `outputs` for tasks seems to be the only way to make
  them use caching effectively.
- Using the `fileGroups` config lets you re-use glob sets across tasks, which is
  useful because otherwise they'd be duplicated among e.g. `build`, `lint`,
  `test`, etc.

## Concurrency and resource limits

Total worker threads under moon are roughly
`MOON_CONCURRENCY x per-task-workers`. moon's `--concurrency`/`MOON_CONCURRENCY`
only controls how many _tasks_ run at once; each `vitest` suite spawns its own
core-sized worker pool and each Rust build (cargo/napi) saturates every core
internally. If you cap only moon, the product still oversubscribes the CPU and
timing-sensitive tests flake.

So two of the three knobs are committed (they travel with the repo), and the
outer dial is per-environment:

- `vitest run --maxWorkers=2` — in `.moon/tasks/typescript.yml` (test task).
- `CARGO_BUILD_JOBS: '6'` — env on each native Rust build task
  (`libs/{ballot-interpreter,pdi-scanner,logging-utils}/moon.yml`).
- `MOON_CONCURRENCY` — env var only (moon 2.4.6 has no committable setting). Set
  it to roughly **cores / 2**:
  - Dev (16 logical cores / 61 GB): `MOON_CONCURRENCY=8` → test peak ~16
    threads.
  - CI, CircleCI **xlarge** (8 vCPU / 16 GB): `MOON_CONCURRENCY=4` → test peak
    ~8 threads = the full 8 vCPU; ~4 concurrent tsc builds fit comfortably in 16
    GB.

**CircleCI gotcha:** the Docker executor reports the _host_ CPU count via
`nproc`/`os.cpus()`, not the resource-class limit. Anything that auto-sizes to
"cores" (moon's default concurrency, cargo's default `-j`, vitest's default
pool) will parallelize against ~30+ phantom cores on an 8-vCPU box and
OOM/thrash. The committed `--maxWorkers` and `CARGO_BUILD_JOBS` neutralize that
for vitest and cargo; **`MOON_CONCURRENCY` must be set explicitly in the
CircleCI job env** — never rely on moon's auto-detect there. If cold Rust builds
ever pressure the 16 GB (they are cached by moon, so this is rare), lower
`CARGO_BUILD_JOBS`.

## Questions

- Can I use `dependsOn` to declare explicit dependencies while also retaining
  implicit dependencies?
- What is the difference between `moon run` and `moon check`?
