# pdi-scanner

A driver for the PDI PageScan 6 scanner written in Rust (`pdictl`). Also exports
a TypeScript client that runs the `pdictl` binary and communicates with it over
stdin/stdout.

## Usage

To run a TypeScript demo script:

```sh
./src/ts/demo
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

To enable Rust debug logging, set the
[`RUST_LOG` environment variable](https://docs.rs/tracing-subscriber/latest/tracing_subscriber/filter/struct.EnvFilter.html)
as appropriate.

To enable TS debug logging, set `DEBUG=pdi-scanner`.

```sh
RUST_LOG=debug DEBUG=pdi-scanner ./src/ts/demo
```
