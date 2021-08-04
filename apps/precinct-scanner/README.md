# Precinct Scanner

The user interface for a precinct scanner. This is intended to be used by
election officials, poll workers, and voters to cast their ballot at a precinct.
Scans ballots printed by the VxSuite [Ballot Marking Device (BMD)](../bmd) or
the VxSuite [Election Manager](../election-manager).

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run the app like so:

```sh
# in apps/precinct-scanner
pnpm start
```

The server will be available at http://localhost:3000/. You may find it easier
to get to certain states from http://localhost:3000/preview.

To set the election configuration you will need to load a ballot export zip file
from [election-manager](../election-manager). It should be on a USB drive
located at `vx-precinct-scanner/ballot-package.zip`. You'll need to run the
application inside
[`kiosk-browser`](https://github.com/votingworks/kiosk-browser).

To use a mock scanner, follow the directions from in
[`module-scan`](../module-scan#Single-sheet-scanner).

## Testing

```sh
pnpm test
```

## License

GPLv3
