# @votingworks/ballot-interpreter

Library to interpret BMD ballots produced by VxMark or hand-marked paper ballots
(HMPB) produced by VxDesign.

## Install

This library requires a
[supported version of Node and Rust](https://github.com/neon-bindings/neon#platform-support).
The easiest way to install Rust is via [rustup](https://rustup.rs/).

## Build

This will build both the Rust library and the Node package.

```sh
$ pnpm build
```

This command uses the
[cargo-cp-artifact](https://github.com/neon-bindings/cargo-cp-artifact) utility
to run the Rust build and copy the built library into
`./build/hmpb-ts/rust_addon.node`.

## CLI

### bin/interpret

Currently, the CLI only works for HMPB.

```sh
# Interpret a single ballot
bin/interpret election.json system-settings.json ballot-side-a.jpeg ballot-side-b.jpeg

# Interpret all ballots in a scan workspace
bin/interpret path/to/workspace

# Interpret specific sheets in a scan workspace
bin/interpret path/to/workspace d34d-b33f

# Write debug images alongside input images
# (i.e. ballot-side-a_debug_scored_bubble_marks.png)
bin/interpret -d election.json system-settings.json ballot-side-a.jpeg ballot-side-b.jpeg
```

### bin/scoring-report

To generate a scoring report for a collection of ballot images, run:

```sh
# Score bubble marks
bin/scoring-report -m election.json ballot-images-dir output-dir

# Score write-ins
bin/scoring-report -w election.json ballot-images-dir output-dir
```

This can be used to iteratively tune the mark thresholds/write-in area
parameters for an election.

## Benchmarks

This library includes benchmarks designed to:

- Help understand how the interpreter performs in different environments (i.e.
  different hardware/software stacks)
- Prevent performance regressions

To run benchmarks for interpretation, run:

```sh
pnpm benchmark
```

This will run a series of benchmark tests, which will interpret a ballot many
times and compute some statistics about the time it takes. The results will be
compared to saved results from a previous run, and, if they differ by too large
an amount, show a test failure message.

### Benchmark Environments

By default, the benchmarks will use saved results from a development
environment. If you'd like to run the benchmarks in a different environment, you
can set the `BENCHMARK_ENV` environment variable to a name of your choosing. For
example:

```sh
BENCHMARK_ENV=production-minipc pnpm benchmark
```

### Updating Saved Results

To update the saved results for a benchmark, run:

```sh
UPDATE_BENCHMARKS=1 pnpm benchmark
```

## License

AGPLv3
