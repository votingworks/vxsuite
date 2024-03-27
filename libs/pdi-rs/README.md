# pdi-rs

A driver for the PDI PageScan 6 scanner written in Rust (`pdictl`). Also exports
a TypeScript client that runs the `pdictl` binary and communicates with it over
stdin/stdout.

## Usage

To run a TypeScript demo script:

```sh
./ts/src/run
```

To run an interactive demo of `pdictl`:

```sh
cargo run --bin pdi-tui
```

## Development

```sh
# install dependencies
pnpm install

# test
pnpm test

# build
pnpm build
```
