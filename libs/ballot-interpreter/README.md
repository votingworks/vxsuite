# @votingworks/ballot-interpreter

Library to interpret BMD ballots produced by VxMark or hand-marked paper ballots
(HMPB) produced by VxDesign.

## Install

This library requires a
[supported version of Node and Rust](https://github.com/neon-bindings/neon#platform-support).
The easiest way to install Rust is via [rustup](https://rustup.rs/).

Then run:

```sh
$ pnpm install
```

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

Currently, the CLI only works for HMPB.

```sh
# Interpret a single ballot
bin/interpret election.json ballot-side-a.jpeg ballot-side-b.jpeg

# Interpret all ballots in a scan workspace
bin/interpret path/to/workspace

# Interpret specific sheets in a scan workspace
bin/interpret path/to/workspace d34d-b33f

# Write debug images alongside input images
# (i.e. ballot-side-a_debug_scored_bubble_marks.png)
bin/interpret -d election.json ballot-side-a.jpeg ballot-side-b.jpeg
```

## License

AGPLv3
