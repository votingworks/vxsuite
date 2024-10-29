# custom-scanner

## Usage

If you just want to play with the Custom scanner, try out `bin/demo`.

### API

Simple example that connects to the scanner and prints the device model:

```ts
import { openScanner, ReleaseType } from '@votingworks/custom-scanner';

const scanner = (await openScanner()).assertOk(
  'Failed to open scanner. Is the device plugged in?'
);

const deviceModel = scanner
  .getReleaseVersion(ReleaseType.Model)
  .assertOk('Failed to get device model.');

console.log('Detected device:', deviceModel);

await scanner.disconnect();
```

A simple example that scans a sheet and saves the images may be found at
[`examples/simple_scan.ts`](examples/simple_scan.ts). For a more complicated
example that exercises more of the features available to the scanner, check out
the [`bin/demo` implementation](src/cli/demo/index.ts).

## Development

```sh
# install dependencies
pnpm install

# test
pnpm test

# builds should happen automatically via TypeScript
# project references, but you can also build manually:
pnpm build
```

## Architecture

The top-level interface for interacting with the Custom scanner is
[`CustomScanner`](src/types/custom_scanner.ts), and has various high-level
methods such as `connect`, `disconnect`, `getStatus`, and `scan`.

`CustomScanner` is implemented by the
[`CustomA4Scanner`](src/custom_a4_scanner.ts) class which sends and receives
arbitrary binary messages over a [`UsbChannel`](src/usb_channel.ts).
`CustomA4Scanner` delegates the actual interaction with its `UsbChannel` to the
functions in [`protocol.ts`](src/protocol.ts). The messages are encoded and
decoded by coders built using the primitives in
[`@votingworks/message-coder`](../message-coder/README.md).
