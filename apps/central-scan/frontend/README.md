# VotingWorks Ballot Scanner (BSD) (VxCentralScan)

Scans ballots printed by the VxSuite [Ballot Marking Device (BMD)](../mark) or
the VxSuite [Election Manager](../admin).

## Setup

Follow the instructions in the [VxSuite README](../../../README.md) to get set
up, then run the app like so:

```sh
# in apps/central-scan/frontend
pnpm start
```

The server will be available at http://localhost:3000/.

To scan ballots without scanner hardware use the `MOCK_SCANNER_FILES`
environment variable set as described in
[`apps/central-scan/backend`](../../backend).

## Testing

```sh
pnpm test
```

## License

GPLv3
