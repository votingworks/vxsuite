# VotingWorks Ballot Marking Device (BMD)

Marks and/or prints ballots for a voter.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run BMD like so:

```sh
# in frontends/bmd
# Run in mark-only mode (when there's a separate standalone printer)
pnpm start
# Or to be verbose:
VX_APP_MODE=MarkOnly pnpm start

# Run in print-only mode (for a standalone printer)
VX_APP_MODE=PrintOnly pnpm start

# Run in mark-and-print mode (for a BMD with its own printer attached)
VX_APP_MODE=MarkAndPrint pnpm start
```

The server will be available at http://localhost:3000/.

## Testing

```sh
pnpm test
```

## License

GPLv3
