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

Add this udev rule to `/etc/udev/rules.d/99-pdi-scanner.rules` to allow the
scanner to be accessed without root permissions:

```sh
SUBSYSTEM=="usb", ATTR{idVendor}=="0bd7", ATTR{idProduct}=="a002", MODE="0660", GROUP="scanner"
```

Then reload the udev rules:

```sh
sudo udevadm control --reload-rules
sudo udevadm trigger
```

You can then run the demo script to test that the driver is working properly,
note that this script does NOT print anything on the command line, it simply
will put the scanner in a loop where it will start reading in pages that are fed
in.

To enable Rust debug logging, set the
[`RUST_LOG` environment variable](https://docs.rs/tracing-subscriber/latest/tracing_subscriber/filter/struct.EnvFilter.html)
as appropriate.

To enable TS debug logging, set `DEBUG=pdi-scanner`.

```sh
RUST_LOG=debug DEBUG=pdi-scanner ./src/ts/demo
```
