# VotingWorks Ballot Scanner (BSD)

Scans ballots printed by the VxSuite [Ballot Marking Device (BMD)](../bmd) or
the VxSuite [Election Manager](../election-manager).

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run the app like so:

```sh
# in apps/bsd
pnpm start
```

The server will be available at http://localhost:3000/.

To set the election configuration you will either need to scan a smartcard (you
can use the mockCardReader script in [module-smartcards](../module-smartcards)
for this), load an election.json file, or load a ballot export zip file from
[election-manager](../election-manager). You should load a ballot export zip if
you intend to test hand-marked paper ballots (HMPBs).

To display a batch of scanned ballots use the `MOCK_SCANNER_FILES` environment
variable set as described in [`module-scan`](../module-scan).

## Testing

```sh
pnpm test
```

## License

GPLv3
