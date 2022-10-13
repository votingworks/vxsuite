# Precinct Scanner (VxScan)

The user interface for a precinct scanner. This is intended to be used by
election officials, poll workers, and voters to cast their ballot at a precinct.
Scans ballots printed by the VxSuite [Ballot Marking Device (BMD)](../bmd) or
the VxSuite [Election Manager](../election-manager).

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up.
You can build and run the app as follows:

```sh
# in frontends/precinct-scanner
pnpm build # on initial setup only
pnpm start
```

The server will be available at http://localhost:3000/. You may find it easier
to get to certain states from http://localhost:3000/preview.

To set the election configuration you will need to load a ballot package from
[election-manager](../election-manager). It should be on a USB drive located in
the folder `ballot-packages`. There can only be one election ballot package in
that folder. You'll need to run the application inside
[`kiosk-browser`](https://github.com/votingworks/kiosk-browser).

To use a mock scanner, follow the directions from in
[`services/scan`](../../services/scan#Single-sheet-scanner).

### Running Services Separately

`pnpm build` and `pnpm start` will build and run, respectively, the app's
dependent services. In the rare cases where you only want to run the app itself
and spin up services separately:

```sh
# in frontends/precinct-scanner
pnpm build:core # on initial setup only
pnpm start:core
```

Then run the following:

- [`services/scan`](../../services/admin), using `pnpm start:precinct-scanner`
- [`services/smartcards`](../../services/smartcards)

## Testing

```sh
pnpm test
```

## License

GPLv3
