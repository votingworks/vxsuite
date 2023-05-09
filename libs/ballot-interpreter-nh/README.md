# `ballot-interpreter-nh`

An experimental interpreter for New Hampshire's AccuVote ballots built for
speed.

This project was bootstrapped by
[create-neon](https://www.npmjs.com/package/create-neon).

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
to run the Rust build and copy the built library into `./build/rust-addon.node`.

## Usage

### API

```ts
import { interpret, findLayout } from '@votingworks/ballot-interpreter-nh';

console.log(
  'Interpretation:',
  interpret(electionDefinition, ['/path/to/scan1.jpeg', '/path/to/scan2.jpeg'])
);

// Determines the layout of a ballot scan or template, does not interpret.
console.log(
  'Layout:',
  findLayout(['/path/to/scan1.jpeg', '/path/to/scan2.jpeg'])
);
```

### CLI

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

AGPL-3.0
