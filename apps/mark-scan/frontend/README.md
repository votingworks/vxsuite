# VotingWorks Ballot Marking Device (BMD)

Marks and prints ballots for a voter. Supports ballot verification per VVSG 2.0.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run BMD like so:

```sh
pnpm start
```

To run without hot reloading (eg. if developing on resource-constrainted
hardware):

```sh
DISABLE_MARKSCAN_HOT_RELOAD=true pnpm start
```

The server will be available at http://localhost:3000/.

## Testing

```sh
pnpm test
```
