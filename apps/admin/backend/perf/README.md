# VxAdmin ballot rendering benchmarks

Scratch harness for measuring VxAdmin's offline ballot rendering and election
package export on real hardware (HP EliteBook 840 G11, Core Ultra 5 125U, 8 GB,
vxdev image). Not for merging.

It runs the same export VxAdmin's Finalize runs
(`renderElectionPackageAndBallots` from
`@votingworks/election-definition-backend/election-package`, VxDefault template,
DEMO state, letter paper, `vxf`), headless, on generated elections, and records
time and memory. Nothing in VxAdmin's production code changed.

It lives in `apps/admin/backend/perf/` because admin-backend already depends on
everything it needs, so no new package or lockfile change. The scripts are
TypeScript run directly by Node 24's type stripping, so they need no build of
their own (they import the built workspace packages).

## Setup on the laptop

```bash
cd ~/code/vxsuite   # or wherever the repo lives on the vxdev image
git fetch origin
git checkout caro/admin-design-perf-testing-c2326d
pnpm install
pnpm -r build:self
```

Playwright needs its Chromium. If a run fails with "Executable doesn't exist",
install it once:

```bash
cd libs/hmpb && ./node_modules/.bin/playwright install chromium
```

Before measuring:

- Close other apps (browser, IDE, VS Code). Leave the desktop session as it is
  otherwise; the idle baseline records what it uses.
- Plug in power and keep the lid open. Thermal behavior differs on battery.
- Stop any running VxAdmin dev server (`pnpm kill-dev` from the repo root),
  unless you're doing the UI run below.
- Keep the machine from sleeping. `run_matrix.sh` and `run_experiments.sh` block
  idle and sleep themselves with `systemd-inhibit`. For a single `run.ts`, run
  it under `systemd-inhibit --what=idle:sleep node run.ts ...`. Keep the lid
  open.

## Commands

All commands run from `apps/admin/backend/perf/`.

### Smoke test (about 10 s)

```bash
node run.ts --election shawnee-general --precincts 20
PRECINCTS=10 COOLDOWN_S=2 BASELINE_S=5 ./run_matrix.sh
```

The second line runs the whole matrix at 10 precincts per election, in about a
minute.

### One run

```bash
node run.ts --election shawnee-general --pool 4
node run.ts --election shawnee-primary --pool 2
node run.ts --election system-limit --pool 4
node run.ts --election santa-clara --pool 4
node run.ts --election shawnee-general --pool 4 --modes official,sample,test
```

Options (`node run.ts --help`):

| Option          | Default             | Meaning                                                                                    |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| `--election`    |                     | `shawnee-general`, `shawnee-primary`, `system-limit`, `santa-clara`, `santa-clara-primary` |
| `--pool`        | 4                   | Renderer pool size (Chromium pages). VxAdmin uses 4.                                       |
| `--modes`       | `official,test`     | What VxAdmin's DEMO state exports. Add `sample` for official+sample+test.                  |
| `--precincts`   | preset              | Scale a preset down (or up), keeping its ratios                                            |
| `--out`         | `perf/results`      | Results root                                                                               |
| `--scratch`     | `$TMPDIR` or `/tmp` | Where scratch PDFs and output zips go                                                      |
| `--keep-output` | off                 | Keep the election package and ballot zips                                                  |

Each run is its own Node process, so memory starts fresh.

### The standard matrix

```bash
./run_matrix.sh
```

It records a 60 s idle baseline, then runs these one at a time with a 60 s
cooldown between runs:

1. Shawnee general, pool 2 and pool 4
2. Shawnee primary, pool 2 and pool 4
3. System limit, pool 4

Environment knobs: `PRECINCTS=<n>` scales every election down for a smoke test;
`INCLUDE_SANTA_CLARA=1` adds the Santa Clara run at pool 4;
`INCLUDE_SYSTEM_LIMIT=0` skips the system-limit run; `REPEAT=2` runs the whole
set twice (worth doing to catch stalls); `COOLDOWN_S`, `BASELINE_S`, and
`RESULTS=<dir>` override the defaults.

To re-summarize any results directory:

```bash
node summarize.ts results/matrix-<timestamp>-<host>
```

### Experiments

```bash
./run_experiments.sh [suite...]
```

Each suite tries possible speedups, one run at a time, with the same idle
baseline, cooldowns and sleep blocking as the matrix. With no suite named it
runs `basic`.

| Suite         | Runs                                                                                                                                                                                                                         | About (AMD laptop)       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `basic`       | Shawnee general: pool 4 today; font fix; no seal; pool 6 and 8; pool 6 + font fix; 2 and 3 processes × 2 pages; 2 × 2 + font fix. Then system limit with the font fix.                                                       | 30 min + 20 min          |
| `shards`      | System limit with the font fix: 1 process × 4 pages, then 2, 3 and 4 processes × 2 pages                                                                                                                                     | 1–1.5 h                  |
| `pools`       | Shawnee primary with the font fix at pool 2, 3, 4, 5, 6 and 8, then system limit with the font fix at pool 4 and 6                                                                                                           | 1–1.25 h                 |
| `scc-primary` | Santa Clara presidential primary with the font fix at 100 and 250 precincts (3,600 and 9,000 styles). Add `SCC_PRIMARY_FULL=1` for the full 1,067 precincts (38,412 styles, 153,648 PDFs), which runs with a 4 GB Node heap. | 1–1.5 h; full adds 3–6 h |

`INCLUDE_SANTA_CLARA=1` adds Santa Clara (inline and served) to `basic`.
`INCLUDE_SYSTEM_LIMIT=0`, `REPEAT`, `PRECINCTS`, `COOLDOWN_S` and `RESULTS` work
as in the matrix.

Each run ends with a short headline (total time, phase split, peak memory for
the export and the whole machine, scratch disk, clock speed). At the end the
suite prints a comparison table and writes it to `headline.md` next to
`summary.md` (more columns) and `summary.csv` (every field).

The switches also work on `run.ts` directly:

- `--fonts served` sets `VX_HMPB_FONTS=served`, which makes
  `createPlaywrightRendererPool` in `libs/hmpb` start a small HTTP server on
  127.0.0.1 for the Roboto fonts and point the ballot styles at it, so Chromium
  fetches and decodes each font once and caches it. Ballots are unchanged:
  served and inline runs give the same ballot hash (`ballot_hash` in the
  summary) and identical word positions. This is the only change to production
  code on this branch, and it's off unless the variable is set.
- `--shards N` renders ballots only (layout and PDFs, no zips or election
  package), since each process builds its own election definition. Compare its
  layout and render times, not package time. Memory includes all the shard
  processes (`node-worker` in the per-role fields).

### Rust prototype

Brian's Rust renderer prototype (`perf/rust-pdf-rendering`, `libs/hmpb-rs`) lays
out and writes PDFs without Chromium. `rust_jobs.ts` writes our generated
elections in the prototype's input format, and `run_rust.sh` times it on each
English election at several thread counts, both one PDF per ballot and one PDF
per ballot style. It renders ballots only (no election definition, bubble
positions or real ballot hash), English only, and the VX template only.

Build the prototype once, outside this checkout:

```bash
mkdir -p ~/rust-proto && git -C ~/code/vxsuite fetch origin perf/rust-pdf-rendering && git -C ~/code/vxsuite archive FETCH_HEAD libs/hmpb-rs libs/fixtures/data/electionGeneral | tar -x -C ~/rust-proto
```

```bash
cd ~/rust-proto/libs/hmpb-rs && cargo build --release
```

Then, from this folder:

```bash
./run_rust.sh
```

It runs 4 and 8 threads and every thread the machine has (`nproc`).
`THREADS="1 2 4"` and the like overrides that, as do `ELECTIONS`,
`PROTOTYPE_DIR` and `RESULTS`. For example,
`ELECTIONS=santa-clara-primary ./run_rust.sh`. The Santa Clara elections run
English-only (`rust_jobs.ts --english-only`), which drops their bilingual
ballots, so they're lighter than the Chromium runs of the same election. Results
go to `results/rust-<date>-<host>/rust.log`.

### Inspect a generated election

```bash
node write_election.ts --election system-limit --out /tmp/system-limit.json
```

It prints the stats (precincts, districts, contests, candidates, ballot styles,
contests per ballot style, PDFs per mode).

## The elections

All are generated deterministically, so every laptop renders the same ballots.
Districts come in layers (county, congressional, state senate, ...). Each
distinct set of districts is one ballot style, and each style gets one district
from each layer, so ballots stay about one sheet. The seal is the
`electionGeneral` fixture seal (37 KB SVG), which is inlined in every ballot.

| Preset                | Precincts             | Districts | Contests | Candidates | Ballot styles                           | Contests per style | Sheets per ballot | PDFs (official+test) |
| --------------------- | --------------------- | --------- | -------- | ---------- | --------------------------------------- | ------------------ | ----------------- | -------------------- |
| `shawnee-general`     | 242                   | 34        | 45       | 128        | 204                                     | 13–16              | 1–2               | 968                  |
| `shawnee-primary`     | 242                   | 34        | 49       | 104        | 408 (2 parties)                         | 10 per party       | 1                 | 1,936                |
| `system-limit`        | 2,500 (2 splits each) | 499       | 1,000    | 2,000      | 5,000                                   | 14                 | 1                 | 20,000               |
| `santa-clara`         | 1,067                 | 82        | 85       | 105        | 6,402 (6 language configs)              | 7–10               | 1                 | 25,608               |
| `santa-clara-primary` | 1,067                 | 66        | 107      | 399        | 38,412 (6 parties × 6 language configs) | 9–12               | 2                 | 153,648              |

"Sheets per ballot" was checked by rendering each preset at small scale; the
general's styles with an extra school or city question spill onto a second
sheet. Each run records `pages_per_pdf` from a sample of its PDFs.

Notes:

- **Shawnee:** 242 precincts, 87 polling places, 34 districts. The general has
  federal, state and county offices, 2 judicial retentions, a county question,
  state legislative and county commission seats, school boards and city councils
  (with a few school and city questions). The primary has D and R slates of
  every partisan office and the county question on the same geography, so it has
  twice the styles.
- **System limit:** every election-level limit in
  `libs/types/src/system_limits.ts` at once: 2,500 precincts, 5,000 ballot
  styles, 1,000 contests, 2,000 candidates. The 5,000 styles come from 2 splits
  per precinct, each with its own district set. Most contests have 2 candidates,
  so 2,000 candidates spread over 998 candidate contests.
- **Santa Clara:** VxSuite supports only 5 non-English languages (es-US,
  zh-Hans, zh-Hant, ar, bn), so 8 bilingual variants isn't possible. Instead it
  uses 1,067 precincts × 6 language configs (English only plus English with each
  of the 5), which gives the same ~6,400 styles and ~25,600 PDFs as SCC's 800
  × 8. That exceeds the 5,000-style limit. Translations are pseudo-translations
  (`[es-US] English text`), which keep the bilingual layout length but render
  only Latin glyphs. Real CJK, Arabic and Bengali text would need fonts the
  vxdev image lacks (fonts-noto-core) and may render slower.

- **Santa Clara presidential primary:** California's 6 qualified parties (DEM,
  REP, AI, GRN, LIB, PF), each with its own ballot, on the Santa Clara geography
  and language configs. Each party ballot has President and a County Central
  Committee (vote for up to 6) for that party, plus "top-two" contests that
  appear on every party's ballot with candidates labeled by party (U.S.
  Representative, State Senate, State Assembly), nonpartisan judges and
  supervisors, and county, city and school measures. Bilingual ballots are two
  sheets. Contests are illustrative, not from a real ballot.

## Results

Each run writes `results/<timestamp>-<label>/` (or into the matrix directory):

| File                      | Contents                                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.json`             | Election stats, pool, modes, machine (CPU, RAM, product name, kernel), Node version and heap limit, git commit                                                                                                                                 |
| `result.json`             | Status, phase timestamps, PDF count, pages per PDF (sampled), output size. Missing if the run was killed (e.g. by the OOM killer).                                                                                                             |
| `progress.csv`            | Main-thread events: phase, PDFs completed, Node `heapUsed`/`heapTotal`/`external`/RSS, event-loop lag. About once a second.                                                                                                                    |
| `system.csv`              | Every second: MemAvailable, swap used, CPU busy %, CPU frequency (avg/min/max over cores), max temperature, package throttle count, scratch-disk bytes, and memory (RSS and PSS) and CPU for Node, its main thread, and all Chromium processes |
| `processes.csv`           | Every second, per process: role (node, chromium-browser, chromium-renderer, chromium-gpu, chromium-utility, chromium-zygote), RSS, PSS (anon/file/shmem), swap PSS, CPU %                                                                      |
| `timeline.csv`            | Memory against layouts done and PDFs rendered over the run (joined from the above). Plot this for the memory-vs-PDFs question.                                                                                                                 |
| `summary.json`            | The computed summary below                                                                                                                                                                                                                     |
| `process_snapshot_*.json` | Top 25 processes on the machine by PSS at the start and end                                                                                                                                                                                    |

The matrix directory also gets `summary.md` (table), `summary.csv` (every
field), `matrix.log`, `failures.txt` (if any run failed) and the
`00-idle-baseline/` directory.

Summary fields worth reading first:

- `wall_s`, `setup_s`, `layout_s`, `render_s`, `package_s`, `s_per_pdf`
  - setup: generating strings, launching Chromium
  - layout: "Laying out ballots"
  - render: "Rendering ballot PDFs"
  - package: calibration sheet, normalizing, ballots.jsonl, zips
- `peak_tree_pss_mb`: peak PSS of Node plus all Chromium processes. PSS doesn't
  double-count shared pages the way summed RSS does. `peak_tree_rss_mb` is there
  to compare with the VM numbers, which were summed RSS.
- `peak_node_pss_mb`, `peak_heap_used_mb`, `peak_chromium_pss_mb`,
  `peak_single_renderer_pss_mb`, `peak_pss_mb_<role>`
- `peak_system_used_mb` (MemTotal − MemAvailable), `min_mem_available_mb`,
  `peak_swap_used_mb`: whether the whole machine got tight
- `render_tree_pss_mb_per_1k`, `render_node_pss_mb_per_1k`,
  `render_chromium_pss_mb_per_1k`, `render_heap_mb_per_1k`: the linear slope of
  memory against PDFs rendered during the render phase, in MB per 1,000 PDFs.
  Near zero means memory is flat; this answers whether memory grows with PDF
  count.
- `avg_freq_mhz`, `min_avg_freq_mhz`, `max_temp_c`, `throttle_events`: thermal
  throttling during layout and render
- `layout_node_main_thread_cpu_pct`, `render_node_main_thread_cpu_pct`: near 100
  means the Node main thread is the bottleneck
- `peak_scratch_mb`: peak size of the scratch and output directories
  (`peak_fs_used_delta_mb` is the same from the filesystem's point of view)

### Copying results off

`results/` is git-ignored. Copy the matrix directory to a USB drive:

```bash
tar czf /media/vx/<usb>/perf-$(hostname).tgz -C results .
```

or with `scp -r results/matrix-* <you>@<host>:` if the laptop is on a network.
The CSVs for the system-limit and Santa Clara runs are a few MB each.

## Expected runtimes

Rough, from VM benchmarks (about 0.09 s per PDF at pool 4, slower at pool 2) and
the 15 W laptop CPU, which may throttle. Treat these as order of magnitude. For
reference, the 10–20 precinct smoke runs took 0.06–0.11 s per PDF on the 8-vCPU
Apple Silicon VM.

| Run                                     | PDFs    | Expected      |
| --------------------------------------- | ------- | ------------- |
| Smoke test (`--precincts 20`)           | 80      | under 1 min   |
| Shawnee general, pool 4                 | 968     | 1.5–3 min     |
| Shawnee general, pool 2                 | 968     | 2–4 min       |
| Shawnee primary, pool 4                 | 1,936   | 3–5 min       |
| Shawnee primary, pool 2                 | 1,936   | 4–7 min       |
| System limit, pool 4                    | 20,000  | 30–75 min     |
| Santa Clara, pool 4                     | ~25,600 | 40–100 min    |
| `./run_matrix.sh` (default)             |         | about 1–1.5 h |
| `INCLUDE_SANTA_CLARA=1 ./run_matrix.sh` |         | about 2–3 h   |

Disk: scratch peaks at roughly the size of all PDFs plus the zips (a few hundred
MB for Shawnee; several GB for system limit and Santa Clara). Check `df -h /tmp`
first and pass `--scratch` if `/tmp` is a small tmpfs.

## End to end through the real UI

The harness skips the UI, the grout API and the SQLite store, so also time one
Finalize through VxAdmin itself.

1. In the repo root's `.env.local`, set
   `REACT_APP_VX_ENABLE_ADMIN_ELECTION_DESIGN=TRUE`. In development the machine
   state defaults to `DEMO`, which is the only supported state.
2. Seed the dev workspace's design store with a generated election. VxAdmin must
   be unconfigured with no election definition (discard any existing one first).
   Stop the dev server while seeding:

   ```bash
   cd apps/admin/backend/perf
   node seed_admin.ts --election shawnee-general
   ```

   This writes districts, parties, contests, precincts and polling places into
   `apps/admin/backend/dev-workspace/data.db` (or `$ADMIN_WORKSPACE`) through
   the admin store's own methods, and prints the ballot style count. It only
   takes English-only presets, since VxAdmin builds only English. To create an
   election by hand instead, use Create New Election and add districts,
   precincts and contests in the UI. That's practical only for small elections.

3. Start VxAdmin: `cd apps/admin/frontend && pnpm start`, and open
   <http://localhost:3000>. Log in as an election manager with the dev dock.
4. Open the election definition, go to Proof Ballots, and get ready to click
   Finalize.
5. In another terminal, start the watcher. It finds the admin backend process,
   samples it and its Chromium the same way as `run.ts`, and polls the build's
   progress from the store:

   ```bash
   cd apps/admin/backend/perf
   node watch_admin.ts --label ui-shawnee-general
   ```

6. Click Finalize. VxAdmin shows the build progress, then configures itself with
   the built election package. The store marks the build succeeded only after
   configuring, so the watcher's `package_s` includes it. When the watcher logs
   `election package succeeded`, press Ctrl-C. It writes the same files as a
   harness run (phase times come from the store's progress, sampled once a
   second) and prints the summary.
7. To run again: Unconfigure on the Election screen, which wipes the election
   definition too. Then stop the dev server, run `seed_admin.ts` again, and
   start over from step 3.

## How this differs from production

- **The vxdev desktop session uses more RAM than the production kiosk** (a full
  desktop instead of a kiosk browser), so free memory is pessimistic here. The
  idle baseline and `process_snapshot_start.json` show what else is resident;
  subtract the desktop's share when comparing with the kiosk. The kiosk also
  runs its own Chromium for the VxAdmin UI, which a headless harness run
  doesn't.
- **Fonts:** vxdev lacks `fonts-noto-core`. That doesn't matter for English
  ballots (the template's fonts ship in `libs/hmpb`), and the Santa Clara preset
  uses Latin pseudo-translations.
- **Node flags:** the harness runs with Node's default heap limit (recorded as
  `heapSizeLimitMb` in `config.json`). If production starts admin-backend with
  different `NODE_OPTIONS`, pass the same ones, e.g.
  `NODE_OPTIONS=--max-old-space-size=4096 node run.ts ...`.
- **In-process vs harness:** VxAdmin runs the export inside admin-backend, next
  to its server and SQLite, and then configures itself from the built package
  (unzipping it and loading the election). The harness runs only the export,
  alone. The UI run above measures the difference, including configuring.
- **Translator:** VxAdmin uses an English-only translator that rejects other
  languages; the harness uses the pseudo-translator for every preset (it is
  never called for English-only elections).
