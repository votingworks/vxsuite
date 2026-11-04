# deskpro-scanner

A driver for the InoTec SCAMAX DeskPro scanner. `deskproctl` (Rust) wraps the
vendor's `libinoapi.so`; the TypeScript client runs it as a child process and
talks to it over stdin/stdout, as `pdi-scanner` does with `pdictl`.

Differences from `pdi-scanner`:

- The wire protocol is little-endian binary in both directions, so images cross
  the pipe without base64 or JSON. `rust/src/protocol.rs` and
  `src/ts/protocol.ts` must change together; the daemon's hello frame carries a
  protocol version so a mismatch fails at startup.
- The vendor library is `dlopen`ed, not linked, so `deskproctl` builds and runs
  without the driver installed (including in CI). A missing driver surfaces as a
  `driverUnavailable` error from `connect`.
- `createMockDaemon()` speaks the wire protocol over in-memory streams, for
  testing against a scanner you don't have.

## Usage

```ts
import { ScannerClient } from '@votingworks/deskpro-scanner';

const scanner = new ScannerClient();
(await scanner.start()).unsafeUnwrap();
(await scanner.connect('VxCentralScan')).unsafeUnwrap();

scanner.on('image', ({ header, data }) => {
  // `header.seqId` pairs the two sides of a sheet; `header.scanSide` is 0 front, 1 back.
  // `header.endorserFrontText` is what the imprinter reports for this sheet.
});

(await scanner.setReady(true)).unsafeUnwrap();
(await scanner.scanStart()).unsafeUnwrap();
```

Against a mock instead of a real daemon:

```ts
import { createMockDaemon, ScannerClient } from '@votingworks/deskpro-scanner';

const daemon = createMockDaemon();
const scanner = new ScannerClient(daemon.transport);
const started = scanner.start();
daemon.sendHello();
await started;
```

## Diagnostics

`deskpro-diag` is a CLI for poking at the driver and scanner directly:

```sh
pnpm diag probe                  # can the driver load here, and if not, why not?
pnpm diag info                   # driver version, scanner version, live status
pnpm diag profile --out p.ino    # dump the active profile
pnpm diag watch --seconds 60 --save-images ./scans
pnpm diag scan --profile-file p.ino --save-images ./scans
pnpm diag profiles   # profiles stored on the scanner
pnpm diag logs --out ./scanner-logs   # the scanner's own traces
```

`probe` works without a scanner or the driver installed.

## Installing the vendor driver

Run the vendor's `install_scamaxusb3.sh` as root. It installs to
`/opt/inotec/scamaxusb3/` and adds a udev rule for USB `2bcc:0001`. The driver
writes profiles to `prof/` there, which only `plugdev` can write, so add the
user running `deskproctl` to that group. Override the library location with
`DESKPRO_INOAPI_PATH`.

The driver needs glibc 2.34 / `GLIBCXX_3.4.30` (Debian 12 has both) plus
`libtiff6`, `liblcms2-2` and `libusb-1.0-0`. Set `[GUI] local=off` in
`conf/config.ini`; the local GUI library needs X/Wayland libraries a headless
machine lacks. Set `apilevel=1` (and `usblevel=1` for USB detail) in the same
file to receive the driver's log through the log callback.

## Scanner requirements

The scanner must have option code `SCLX` (Linux driver) installed. Without it,
the scanner locks its display on every remote connect and refuses `start` with
`501 noconfig`. The code is entered as the `service` user, and the scanner
reports itself as not idle to `ScannerConnect` while `service` is logged in.

## Driver quirks

- `ScannerConnect`'s "reserved" integers are the profile schema range. Zeros put
  the driver in a lite mode that refuses `SetScannerSetup`; the scanner speaks
  schema 210 and the driver accepts 69–210.
- With `local=off` the driver calls a null UI callback on operational-state
  messages. `ffi::ui_shim` installs a no-op before connecting.
- A process that loaded the driver may abort at exit with
  `terminate called without an active exception`, from a joinable `std::thread`
  in the driver's static destructors.

## Development

```sh
pnpm install
pnpm build
pnpm test:run
```

`pnpm test:run` runs the Rust tests, then the TypeScript tests. Some TypeScript
tests spawn the real `deskproctl` to check the two protocol halves against each
other, so they need `pnpm build` first.

Rust logging is `RUST_LOG`; TypeScript logging is `DEBUG=deskpro-scanner`.
