# VotingWorks Ballot Marking Device (BMD)

Marks and prints ballots for a voter.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run BMD like so:

```sh
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
