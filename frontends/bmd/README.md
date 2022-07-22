# VotingWorks Ballot Marking Device (BMD)

Marks and/or prints ballots for a voter.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run BMD like so:

```sh
# In frontends/bmd
# To run in mark-only mode (when there's a separate standalone printer)
VX_APP_MODE=MarkOnly pnpm start

# To run in print-only mode (for a standalone printer)
VX_APP_MODE=PrintOnly pnpm start

# To run in mark-and-print mode (for a BMD with its own printer attached)
VX_APP_MODE=MarkAndPrint pnpm start

# By default, the BMD runs in mark-and-print mode
pnpm start

```

The server will be available at http://localhost:3000/.

## Testing

```sh
pnpm test
```

### Cypress

Some tests are written using Cypress. To run those tests, run:

```sh
pnpm test:e2e:ci
```

Or, to develop Cypress tests, run:

```sh
# in one terminal
pnpm test:e2e:setup

# in another terminal
pnpm test:e2e:watch
```

## License

GPLv3
