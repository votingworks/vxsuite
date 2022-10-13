# VotingWorks Ballot Scanner (BSD) (VxCentralScan)

Scans ballots printed by the VxSuite [Ballot Marking Device (BMD)](../bmd) or
the VxSuite [Election Manager](../election-manager).

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run the app like so:

```sh
# in frontends/bsd
pnpm build # on initial setup only
pnpm start
```

The server will be available at http://localhost:3000/.

To set the election configuration you will either need to scan a smartcard (you
can use the mockCardReader script in
[services/smartcards](../../services/smartcards) for this), load an
election.json file, or load a ballot package from
[election-manager](../election-manager). You should load a ballot package if you
intend to test hand-marked paper ballots (HMPBs).

To display a batch of scanned ballots use the `MOCK_SCANNER_FILES` environment
variable set as described in [`services/scan`](../../services/scan).

### Running Services Separately

`pnpm build` and `pnpm start` will build and run, respectively, the app's
dependent services. In the rare cases where you only want to run the app itself
and spin up services separately:

```sh
# in frontends/bsd
pnpm build:core # on initial setup only
pnpm start:core
```

Then run the following:

- [`services/scan`](../../services/admin), using `pnpm start:bsd`
- [`services/smartcards`](../../services/smartcards)

## Testing

```sh
pnpm test
```

## License

GPLv3
