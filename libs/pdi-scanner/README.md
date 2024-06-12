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

You can then run the demo script to test that the driver is working properly, note that this script does NOT print anything on the command line, it simply will put the scanner in a loop where it will start reading in pages that are fed in. 

If the demo script outputs the following error you need to give higher permissions to the USB Device: 

```sh
{
  response: 'error',
  code: 'other',
  message: 'usb error: rusb error: Access denied (insufficient permissions)'
}
```
You can do that by running `lsusb` and look for the entry that reads something like “Andrew Pargeter & Associates PageScan 6D” take note of the Bus and Device 3 digit IDs. Then run:
```sh
sudo chmod 777 /dev/bus/usb/<3-digit-bus-number>/<3-digit-device-number>
```

To enable Rust debug logging, set the
[`RUST_LOG` environment variable](https://docs.rs/tracing-subscriber/latest/tracing_subscriber/filter/struct.EnvFilter.html)
as appropriate.

To enable TS debug logging, set `DEBUG=pdi-scanner`.

```sh
RUST_LOG=debug DEBUG=pdi-scanner ./src/ts/demo
```
