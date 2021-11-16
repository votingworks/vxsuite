# VotingWorks Ballot Marking Device (BMD)

Marks and/or prints ballots for a voter.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run BMD like so:

```sh
# in frontends/bmd
# Run VxMark by default
pnpm start

# Or run VxPrint
VX_APP_MODE=VxPrint pnpm start

# Or run VxMark + VxPrint
VX_APP_MODE="VxMark + VxPrint" pnpm start
```

The server will be available at http://localhost:3000/.

## Testing

```sh
pnpm test
```

## License

GPLv3
