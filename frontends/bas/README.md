# VotingWorks Ballot Activation System (BAS) (VxEncode)

Activates voter cards for use with the VxSuite
[Ballot Marking Device (BMD)](../bmd).

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up.
You can build and run the app as follows:

```sh
# in frontends/bas
pnpm build # on initial setup only
pnpm start
```

The server will be available at http://localhost:3000/.

### Running Services Separately

`pnpm build` and `pnpm start` will build and run, respectively, the smartcard
service that the app depends on. In the rare cases where you only want to run
the app itself and spin up the smartcard service separately:

```sh
# in frontends/bas
pnpm build:core # on initial setup only
pnpm start:core
```

Then, build and run [`services/smartcards`](../../services/smartcards).

## Testing

```sh
pnpm test
```

## License

GPLv3
