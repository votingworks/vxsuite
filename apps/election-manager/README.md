# Election Manager

This app is intended to be used on an offline computer by an election admin.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run the app like so:

```sh
# in apps/election-manager
pnpm start
```

The server will be available at http://localhost:3000/.

### Optional prerequisites

- If you want to program smartcards, start
  [`module-smartcards`](../module-smartcards)
- If you will need to convert SEMS files, start
  [`module-converter-ms-sems`](../module-converter-ms-sems)

## Testing

```sh
pnpm test
```

## License

GPLv3
