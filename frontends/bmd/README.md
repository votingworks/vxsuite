# VotingWorks Ballot Marking Device (BMD)

Marks and/or prints ballots for a voter.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up.
If it's your first time running the app, you'll have to build it:

```sh
# In frontends/bmd
pnpm build
```

Then to run the app:

```sh
# in frontends/bmd
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

### Running Services Separately

`pnpm build` and `pnpm start` will build and run, respectively, the smartcard
service that the app depends on. In the rare cases where you only want to run
the app itself and spin up the smartcard service separately:

```sh
# in frontends/bmd
pnpm build:core # on initial setup only
pnpm start:core
```

Then, build and run [`services/smartcards`](../../services/smartcards).

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
