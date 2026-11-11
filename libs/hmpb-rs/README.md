# hmpb-rs (prototype)

An experimental Rust renderer for `libs/hmpb` ballots that lays out and writes
PDFs directly instead of driving Chromium. It ports the VX default template
only.

- Layout: [taffy](https://crates.io/crates/taffy) (CSS block/flex/grid) with a
  small HTML-subset parser for contest descriptions
- Text: [parley](https://crates.io/crates/parley)
- PDF: [krilla](https://crates.io/crates/krilla)

It is excluded from the root Cargo workspace.

## Usage

```sh
cargo build --release

# Render the electionGeneral fixture's ballots into <dir>
./target/release/hmpb-rs render <dir>

# Benchmark: <ballots> <threads>
./target/release/hmpb-rs 4800 16

# Render the jobs in a directory written by scripts/make_ref.mjs or scripts/make_jobs.mjs
./target/release/hmpb-rs real <dir>

# Render all jobs grouped into PDFs per ballot, precinct, ballot style, or all
./target/release/hmpb-rs group <dir> --by=style --threads=16
```

## Comparison scripts

Run these from the repo root after building `libs/hmpb` (they import its build
output).

- `scripts/make_ref.mjs <election.json> <dir> [max]`: renders reference PDFs
  with the Chromium pipeline and writes `jobs.json`, `positions.json`, and the
  parsed election for `hmpb-rs real <dir>`
- `scripts/compare_real.mjs <dir>`: compares Chromium and Rust bubble positions
  and word positions per ballot
- `scripts/compare_words.mjs <a.pdf> <b.pdf>`: word-level position diff of two
  PDFs (needs `pdftotext`)
- `scripts/make_jobs.mjs <election.json> <dir>`: writes jobs for every ballot
  configuration without rendering, for `hmpb-rs group`
- `scripts/js_bench.mjs <election.json> [pool]` and
  `scripts/js_shard.mjs <election.json> <shard> <shards> <pool>`: Chromium
  pipeline benchmarks, single-process and sharded by ballot style
