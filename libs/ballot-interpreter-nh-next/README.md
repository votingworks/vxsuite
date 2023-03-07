# `ballot-interpreter-nh-next`

An experimental interpreter for New Hampshire's AccuVote ballots built for
speed.

This project was bootstrapped by
[create-neon](https://www.npmjs.com/package/create-neon).

## Install

This library requires a
[supported version of Node and Rust](https://github.com/neon-bindings/neon#platform-support).
The easiest way to install Rust is via [rustup](https://rustup.rs/).

This fully installs the project, including installing any dependencies and
running the build.

## Build

This will build both the Rust library and the Node package.

```sh
$ pnpm build
```

This command uses the
[cargo-cp-artifact](https://github.com/neon-bindings/cargo-cp-artifact) utility
to run the Rust build and copy the built library into `./build/extension.node`.

## License

AGPL-3.0
